/*
 * Reading one finished conversation for words worth remembering.
 *
 * Runs when a conversation has been quiet for a while, on the model the user already
 * pays for, and writes nothing: everything it finds goes to the queue, and the user
 * decides. Guessing what somebody's abbreviation means and acting on it forever is the
 * failure mode this whole feature is arranged to avoid.
 */
import { parseMemoryCandidates, renderTranscriptForExtraction } from '../../../shared/memory-extract.ts';
import type { BackgroundJobError } from '../background/background-runner.ts';
import type { BackgroundSession } from '../background/background-jobs.ts';
import type { RunAgentText } from '../background/background-agent-io.ts';
import type { MemoryService } from './memory-service.ts';
import type { ConversationsStore } from '../store/conversations-store.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type MemoryExtractorDeps = {
  readonly conversations: ConversationsStore;
  readonly memory: MemoryService;
  readonly runAgentText: RunAgentText;
  readonly prompt: string;
  readonly session: () => Promise<Result<BackgroundSession, string>>;
};

export type MemoryExtractor = {
  readonly extract: (conversationId: string, signal: AbortSignal) => Promise<Result<null, BackgroundJobError>>;
};

const MAX_TURNS = 12;
// Enough to look a colleague up in the directory, nothing that writes.
const TOOLS = ['Bash', 'Read', 'Grep', 'Glob'];

export const createMemoryExtractor = (deps: MemoryExtractorDeps): MemoryExtractor => {
  const extract = async (conversationId: string, signal: AbortSignal): Promise<Result<null, BackgroundJobError>> => {
    const conversation = await deps.conversations.get(conversationId);
    // Deleted since it went quiet: nothing to read.
    if (!conversation.ok) return err({ kind: 'skipped', message: 'that conversation is gone' });

    const messages = conversation.value.messages;
    if (!(await deps.memory.extractionDue(conversationId, messages.length))) return err({ kind: 'skipped', message: 'nothing new has been said' });

    const session = await deps.session();
    if (!session.ok) return err({ kind: 'skipped', message: session.error });

    const from = await deps.memory.readSoFar(conversationId);
    const answer = await deps.runAgentText({
      prompt: `${deps.prompt}\n\n## The conversation\n\n${renderTranscriptForExtraction(messages, from)}`,
      model: session.value.model,
      cwd: session.value.cwd,
      env: session.value.env,
      maxTurns: MAX_TURNS,
      allowedTools: TOOLS,
      hooks: session.value.hooks,
      signal,
    });
    if (!answer.ok) return err({ kind: 'failed', message: answer.error });

    const found = parseMemoryCandidates(answer.value);
    // An unreadable answer is worth retrying; an empty one is not. Marking the
    // conversation read either way would lose the first, and not marking it would
    // re-read the second forever.
    if (!found.ok) return err({ kind: 'failed', message: found.error });

    const added = await deps.memory.addCandidates(found.value, conversationId);
    if (!added.ok) return err({ kind: 'failed', message: added.error.message });

    await deps.memory.markExtracted(conversationId, messages.length);
    return ok(null);
  };

  return { extract };
};
