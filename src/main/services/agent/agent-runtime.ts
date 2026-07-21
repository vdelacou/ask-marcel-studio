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
import { buildAgentHooks } from './agent-hooks.ts';
import { emptyFold, foldSdkMessage } from '../../../shared/sdk-event-fold.ts';
import { buildSessionEnv } from '../../../shared/session-env.ts';
import { formatModelRef, parseModelRef } from '../../../shared/model-ref.ts';
import { appendTurn } from '../../../shared/conversation-doc.ts';
import { rewriteSlashSkill } from '../../../shared/slash-skill.ts';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { SdkAgentDefinition } from '../../../shared/agents-doc.ts';
import type { ChatError, ChatSendInput, UIEvent } from '../../../shared/ipc-contract.ts';
import type { Conversation, Provider, Settings } from '../../../shared/types.ts';
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
  // The always-on Microsoft 365 core, appended to the claude_code preset system prompt
  // on every turn. Carried as a string (read from a bundled resource by the composition
  // root) rather than a seeded CLAUDE.md, because settingSources: ['user'] does not load
  // CLAUDE.md files (SDK 0.3.185). Empty string is safe: the agent still works via skills.
  readonly corePrompt: string;
  // The installed skills' folder names, read per send so a skill added in settings
  // applies from the next message. Used only to recognise a `/name` invocation.
  readonly listSkillFolders: () => Promise<readonly string[]>;
  // Microsoft 365 command name to category, from the CLI's own catalog. Feeds the
  // PreToolUse guard so a category switched off in settings is actually refused.
  readonly officeCommandCategories: ReadonlyMap<string, string>;
  // The helpers this turn may delegate to: the built-ins with any change the user made,
  // plus their own. Read per send so an edit in settings applies from the next message.
  readonly listAgents: () => Promise<Readonly<Record<string, SdkAgentDefinition>>>;
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

  // `text` is what the user typed and what gets persisted; `prompt` is what the model
  // is asked. They differ only when the message invoked a skill by name: the transcript
  // must stay the user's own record.
  const runTurn = async (
    conversation: Conversation,
    text: string,
    prompt: string,
    provider: Provider,
    modelId: string,
    workspace: string,
    disabledOfficeCategories: readonly string[],
    agents: Readonly<Record<string, SdkAgentDefinition>>,
    controller: AbortController
  ): Promise<void> => {
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
        prompt,
        options: {
          abortController: controller,
          model,
          cwd: workspace,
          env: buildSessionEnv({ provider, modelId, userData: deps.userData, inheritedEnv: deps.inheritedEnv, ...(gateway === undefined ? {} : { gateway }) }),
          // The M365 core rides `append` on the preset, not a CLAUDE.md: it loads on
          // every turn regardless of setting sources or cwd. The helpers are passed
          // programmatically for the same reason: settingSources: ['user'] loads no
          // agent files, so there is nowhere on disk for them to come from.
          systemPrompt: { type: 'preset', preset: 'claude_code', append: deps.corePrompt },
          agents,
          settingSources: ['user'],
          // No approval prompts anywhere in this app: a PreToolUse hook denial
          // short-circuits regardless of the permission mode, which is what lets the
          // handful of irreversible commands be refused without a dialog appearing in
          // front of someone who cannot judge it.
          hooks: buildAgentHooks({ workspaceDir: workspace, disabledOfficeCategories, officeCommandCategories: deps.officeCommandCategories }),
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
      // Persisted BEFORE the conversation leaves the running map: a second send that
      // arrives in this window must be refused as busy rather than read a file that is
      // missing the exchange the user just watched.
      await persist(conversation, text, fold.parts, fold.sdkSessionId, messageId);
      running.delete(conversation.id);
    }
  };

  // Persist once per turn end, whatever happened. A cancelled or crashed turn keeps
  // what it produced: the parts are already honest about a tool left running.
  //
  // The turn's own snapshot is only a fallback. What is on disk now is the base, so a
  // rename (or any other edit) that landed while the turn ran is not written over.
  const persist = async (
    snapshot: Conversation,
    text: string,
    parts: Conversation['messages'][number]['parts'],
    sdkSessionId: string | undefined,
    messageId: string
  ): Promise<void> => {
    const fresh = await deps.conversations.get(snapshot.id);
    // Deleted mid-turn: saving would resurrect a conversation the user threw away.
    if (!fresh.ok && fresh.error.kind === 'not-found') return;
    // Any other read failure: a stale title beats losing the turn the user just had.
    const base = fresh.ok ? fresh.value : snapshot;

    const at = deps.now();
    const { conversation, titleChanged } = appendTurn(base, {
      text,
      parts,
      ...(sdkSessionId === undefined ? {} : { sdkSessionId }),
      userMessageId: newMessageId(),
      assistantMessageId: messageId,
      at,
    });

    const saved = await deps.conversations.save(conversation);
    if (!saved.ok) {
      deps.emit({ type: 'error', conversationId: snapshot.id, message: `the conversation could not be saved: ${saved.error.message}` });
      return;
    }
    deps.emit({ type: 'turn-saved', conversationId: snapshot.id });
    if (titleChanged) deps.emit({ type: 'title', conversationId: snapshot.id, title: conversation.title });
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

    const prompt = rewriteSlashSkill({ text: input.text, skillFolders: await deps.listSkillFolders() });

    const controller = new AbortController();
    running.set(input.conversationId, controller);
    // Deliberately not awaited: send resolves when the turn is ACCEPTED. Everything
    // it produces reaches the renderer on the event stream.
    void runTurn(
      conversation.value,
      input.text,
      prompt,
      resolved.value.provider,
      resolved.value.modelId,
      workspace.value,
      settings.value.officePolicy?.disabledCategories ?? [],
      await deps.listAgents(),
      controller
    );
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
