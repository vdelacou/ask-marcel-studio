/*
 * A turn nobody is watching.
 *
 * The second (and only other) query() call site. Everything about it is stripped back
 * from the conversation runtime: no streaming, no event fold, no session to resume, no
 * skills, no helpers, and a hard turn limit. It exists to produce one string.
 *
 * It keeps two things: the same environment (so the Microsoft 365 CLI is on its PATH
 * exactly as it is in a conversation) and the same PreToolUse guard, because a job the
 * user cannot see is the last place to relax what the shell may do.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type RunAgentTextInput = {
  readonly prompt: string;
  readonly model: string;
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly maxTurns: number;
  readonly allowedTools: readonly string[];
  readonly hooks: NonNullable<Options['hooks']>;
  readonly signal: AbortSignal;
};

export type RunAgentText = (input: RunAgentTextInput) => Promise<Result<string, string>>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const createRunAgentText = (): RunAgentText => async (input) => {
  const controller = new AbortController();
  input.signal.addEventListener('abort', () => controller.abort());

  try {
    const turn = query({
      prompt: input.prompt,
      options: {
        abortController: controller,
        model: input.model,
        cwd: input.cwd,
        env: input.env,
        maxTurns: input.maxTurns,
        allowedTools: [...input.allowedTools],
        hooks: input.hooks,
        // No setting sources: a background job must not pick up the user's skills, and
        // it has no conversation to belong to.
        settingSources: [],
        permissionMode: 'bypassPermissions',
      },
    });

    // Only the final result matters. Everything else this produces is narration nobody
    // will ever read. Read as a plain record for the same reason the event fold is:
    // the SDK's result union is a moving target and this needs two fields of it.
    for await (const message of turn) {
      const record: Record<string, unknown> = message;
      if (!isRecord(record) || record['type'] !== 'result') continue;
      const text = typeof record['result'] === 'string' ? record['result'] : undefined;
      if (record['is_error'] === true || record['subtype'] !== 'success') return err(text ?? 'the background job did not finish');
      return ok(text ?? '');
    }
    return err('the background job produced nothing');
  } catch (e) {
    return err(formatError(e));
  }
};
