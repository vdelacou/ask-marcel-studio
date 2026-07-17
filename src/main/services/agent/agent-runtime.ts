/*
 * Runs one agent turn per user message and streams the result to the renderer.
 *
 * The IO shell around sdk-event-fold: this file owns the SDK subprocess, the
 * in-flight run map, and persistence; the fold owns every decision about what a
 * message means. Nothing here interprets SDK payloads.
 *
 * Cancel uses Options.abortController, NOT query.interrupt(). Probed against 0.3.185:
 * with a string prompt, interrupt() resolves and does nothing while the turn keeps
 * running. See .claude/LESSONS.md.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { emptyFold, foldSdkMessage } from '../../../shared/sdk-event-fold.ts';
import { buildSessionEnv } from '../../../shared/session-env.ts';
import { formatModelRef, parseModelRef } from '../../../shared/model-ref.ts';
import { titleFromFirstMessage } from '../../../shared/conversation-doc.ts';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { ChatError, ChatSendInput, UIEvent } from '../../../shared/ipc-contract.ts';
import type { Conversation, Message, Provider, Settings } from '../../../shared/types.ts';
import type { ConversationsStore } from '../store/conversations-store.ts';
import type { Gateway } from '../gateway/gateway-server.ts';
import type { SettingsStore } from '../store/settings-store.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type AgentRuntimeDeps = {
  readonly settings: SettingsStore;
  readonly conversations: ConversationsStore;
  // Started on the first turn that needs it, not at launch: an Anthropic-only user
  // never pays for a listening socket.
  readonly gateway: Gateway;
  readonly userData: string;
  readonly now: () => string;
  readonly emit: (event: UIEvent) => void;
  // Parameterised so the composition root stays explicit and this never reads
  // process.env directly.
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>;
};

export type AgentRuntime = {
  readonly send: (input: ChatSendInput) => Promise<Result<null, ChatError>>;
  readonly cancel: (conversationId: string) => Promise<Result<null, ChatError>>;
  readonly cancelAll: () => void;
};

const newMessageId = (): string => crypto.randomUUID();

const resolveProvider = (settings: Settings, modelRef: string): Result<{ provider: Provider; modelId: string }, ChatError> => {
  const parsed = parseModelRef(modelRef);
  if (!parsed.ok) return err({ kind: 'unknown-model', message: parsed.error.message });

  const provider = settings.providers.find((p) => p.id === parsed.value.providerId);
  if (provider === undefined) return err({ kind: 'unknown-model', message: `no provider named ${parsed.value.providerId} is configured` });
  return ok({ provider, modelId: parsed.value.modelId });
};

export const createAgentRuntime = (deps: AgentRuntimeDeps): AgentRuntime => {
  // One in-flight run per conversation. The value is how we stop it.
  const running = new Map<string, AbortController>();

  const runTurn = async (conversation: Conversation, text: string, provider: Provider, modelId: string, workspace: string, controller: AbortController): Promise<void> => {
    const messageId = newMessageId();
    let fold = emptyFold(messageId);
    deps.emit({ type: 'turn-start', conversationId: conversation.id, messageId });

    try {
      // Lazy: an openai provider needs the loopback gateway, an anthropic one does not.
      const gateway = provider.kind === 'openai' ? await deps.gateway.start() : undefined;
      // Through the gateway the model must keep its providerId: the gateway routes on
      // it, and query's `model` option overrides ANTHROPIC_MODEL, so setting the env
      // var alone is not enough. Direct to Anthropic it must be the bare id, which is
      // all the real API has heard of.
      const model = gateway === undefined ? modelId : formatModelRef({ providerId: provider.id, modelId });
      const turn = query({
        prompt: text,
        options: {
          abortController: controller,
          model,
          cwd: workspace,
          env: buildSessionEnv({ provider, modelId, userData: deps.userData, inheritedEnv: deps.inheritedEnv, ...(gateway === undefined ? {} : { gateway }) }),
          systemPrompt: { type: 'preset', preset: 'claude_code' },
          settingSources: ['user'],
          permissionMode: 'bypassPermissions',
          includePartialMessages: true,
          ...(conversation.sdkSessionId === undefined ? {} : { resume: conversation.sdkSessionId }),
        },
      });

      for await (const message of turn) {
        const step = foldSdkMessage(fold, message, conversation.id);
        fold = step.state;
        for (const event of step.events) deps.emit(event);
      }
    } catch (e) {
      // An abort throws here. It is a user action, not a failure, and must not
      // surface as an error toast.
      if (!controller.signal.aborted) {
        deps.emit({ type: 'error', conversationId: conversation.id, message: formatError(e) });
      }
    } finally {
      running.delete(conversation.id);
      await persist(conversation, text, fold.parts, fold.sdkSessionId, messageId);
    }
  };

  // Persist once per turn end, whatever happened. A cancelled or crashed turn keeps
  // what it produced: the parts are already honest about a tool left running.
  const persist = async (
    conversation: Conversation,
    text: string,
    parts: Conversation['messages'][number]['parts'],
    sdkSessionId: string | undefined,
    messageId: string
  ): Promise<void> => {
    const at = deps.now();
    const userMessage: Message = { id: newMessageId(), role: 'user', parts: [{ type: 'text', text }], createdAt: at };
    const assistantMessage: Message = { id: messageId, role: 'assistant', parts, createdAt: at };

    const isFirst = conversation.messages.length === 0;
    const title = isFirst ? titleFromFirstMessage(text) : conversation.title;

    const saved = await deps.conversations.save({
      ...conversation,
      title,
      updatedAt: at,
      ...(sdkSessionId === undefined ? {} : { sdkSessionId }),
      messages: [...conversation.messages, userMessage, ...(parts.length === 0 ? [] : [assistantMessage])],
    });
    if (!saved.ok) {
      deps.emit({ type: 'error', conversationId: conversation.id, message: `the conversation could not be saved: ${saved.error.message}` });
      return;
    }
    if (isFirst) deps.emit({ type: 'title', conversationId: conversation.id, title });
  };

  const send = async (input: ChatSendInput): Promise<Result<null, ChatError>> => {
    if (running.has(input.conversationId)) return err({ kind: 'busy', message: 'this conversation is already answering' });

    const conversation = await deps.conversations.get(input.conversationId);
    if (!conversation.ok) return err(conversation.error);

    const settings = await deps.settings.get();
    if (!settings.ok) return err(settings.error);
    if (settings.value.providers.length === 0) return err({ kind: 'no-provider', message: 'add a provider in settings before starting a conversation' });

    const resolved = resolveProvider(settings.value, conversation.value.model);
    if (!resolved.ok) return err(resolved.error);

    const workspace = await deps.conversations.workspaceFor(input.conversationId);
    if (!workspace.ok) return err(workspace.error);

    const controller = new AbortController();
    running.set(input.conversationId, controller);
    // Deliberately not awaited: send resolves when the turn is ACCEPTED. Everything
    // it produces reaches the renderer on the event stream.
    void runTurn(conversation.value, input.text, resolved.value.provider, resolved.value.modelId, workspace.value, controller);
    return ok(null);
  };

  const cancel = async (conversationId: string): Promise<Result<null, ChatError>> => {
    const controller = running.get(conversationId);
    // Cancelling a turn that already finished is a no-op, not an error: the user
    // clicked Stop just as it ended.
    if (controller !== undefined) controller.abort();
    return Promise.resolve(ok(null));
  };

  // Called at app quit: a turn left running would keep an orphaned subprocess alive.
  const cancelAll = (): void => {
    for (const controller of running.values()) controller.abort();
    running.clear();
  };

  return { send, cancel, cancelAll };
};
