/*
 * Naming a conversation once it has had its first exchange.
 *
 * The sidebar used to show the first message, which for a skill invocation meant the
 * command was the name. A small model reads the question and the answer and says what it
 * was about, in the language the user wrote in.
 *
 * Cheap by construction: one turn, no tools, the conversation's own model (the same one
 * that just answered, so no second provider gets involved), and a prompt clipped to a
 * thousand characters a side. It runs once per conversation, after the first turn.
 */
import { buildTitlePrompt, sanitizeGeneratedTitle } from '../../../shared/title-generation.ts';
import type { RunAgentText } from './background-agent-io.ts';
import type { BackgroundJobError } from './background-runner.ts';
import type { ConversationsStore } from '../store/conversations-store.ts';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type TitleJobDeps = {
  readonly runAgentText: RunAgentText;
  readonly conversations: ConversationsStore;
  // Resolved by the dispatcher, exactly as the other jobs do. The preferred model is the
  // conversation's own.
  readonly session: (
    preferredModel?: string
  ) => Promise<Result<{ readonly model: string; readonly cwd: string; readonly env: Record<string, string>; readonly hooks: NonNullable<Options['hooks']> }, string>>;
  // Tells the window the sidebar has a new name to show.
  readonly onTitle: (conversationId: string, title: string) => void;
};

export type TitleJob = {
  readonly run: (conversationId: string, signal: AbortSignal) => Promise<Result<null, BackgroundJobError>>;
};

// One turn is the whole guarantee that this stays cheap: with no tools to call and
// nothing to read, there is nothing for a second turn to do.
const MAX_TURNS = 1;

const firstTextOf = (parts: readonly { readonly type: string; readonly text?: string }[]): string =>
  parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join(' ')
    .trim();

export const createTitleJob = (deps: TitleJobDeps): TitleJob => {
  const run = async (conversationId: string, signal: AbortSignal): Promise<Result<null, BackgroundJobError>> => {
    const conversation = await deps.conversations.get(conversationId);
    // Deleted while the job was queued: nothing to name, and nothing to recreate.
    if (!conversation.ok) return err({ kind: 'skipped', message: 'that conversation is gone' });
    if (conversation.value.userRenamed === true) return err({ kind: 'skipped', message: 'the user named this one themselves' });

    const userText = firstTextOf(conversation.value.messages.find((message) => message.role === 'user')?.parts ?? []);
    const assistantText = firstTextOf(conversation.value.messages.find((message) => message.role === 'assistant')?.parts ?? []);
    // A turn that produced no words (only tool calls, or a failure) says nothing about
    // what the conversation is; the derived title stands until the next turn.
    if (userText.length === 0 || assistantText.length === 0) return err({ kind: 'skipped', message: 'nothing was said yet' });

    const session = await deps.session(conversation.value.model);
    if (!session.ok) return err({ kind: 'skipped', message: session.error });

    const answer = await deps.runAgentText({
      prompt: buildTitlePrompt({ userText, assistantText }),
      model: session.value.model,
      cwd: session.value.cwd,
      env: session.value.env,
      maxTurns: MAX_TURNS,
      allowedTools: [],
      hooks: session.value.hooks,
      signal,
    });
    if (!answer.ok) return err({ kind: 'failed', message: answer.error });

    const title = sanitizeGeneratedTitle(answer.value);
    if (title === undefined) return err({ kind: 'skipped', message: 'the model did not answer with a name' });

    // Reads fresh: a rename that landed while the model was thinking wins.
    const named = await deps.conversations.setGeneratedTitle(conversationId, title);
    if (!named.ok) return err({ kind: 'failed', message: named.error.message });
    if (named.value.title === title) deps.onTitle(conversationId, title);
    return ok(null);
  };

  return { run };
};
