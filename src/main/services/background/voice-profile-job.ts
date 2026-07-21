/*
 * Writing the user's voice profile from their own sent mail.
 *
 * The one background job that needs a model: deciding how somebody writes is not
 * something a CLI can do. It runs once, silently, when there is no profile yet, and
 * again only when the user asks for it.
 *
 * What comes back IS the profile: the prompt tells the model to output nothing else, so
 * there is no file for it to write and nothing to parse. It is clipped rather than
 * trusted, because this text is read into every draft afterwards.
 */
import type { RunAgentText } from './background-agent-io.ts';
import type { BackgroundJobError } from './background-runner.ts';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type VoiceProfileJobDeps = {
  readonly runAgentText: RunAgentText;
  readonly prompt: string;
  readonly hasProfile: () => Promise<boolean>;
  readonly write: (markdown: string) => Promise<Result<null, string>>;
  // Everything the headless turn needs, resolved by the dispatcher because it is the
  // same resolution a conversation does.
  readonly session: () => Promise<
    Result<{ readonly model: string; readonly cwd: string; readonly env: Record<string, string>; readonly hooks: NonNullable<Options['hooks']> }, string>
  >;
};

export type VoiceProfileJob = {
  readonly run: (force: boolean, signal: AbortSignal) => Promise<Result<null, BackgroundJobError>>;
};

// Long enough to be a profile, short enough to be worth reading before every draft.
const MIN_BYTES = 200;
const MAX_BYTES = 8_192;
const MAX_TURNS = 16;
const TOOLS = ['Bash', 'Read', 'Grep', 'Glob'];

// The prompt says to output the profile and nothing else; a model that wraps it in a
// fence anyway has still done the job.
const unfence = (text: string): string => {
  const trimmed = text.trim();
  const fenced = /^```(?:markdown|md)?\n([\s\S]*)\n```$/.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
};

export const createVoiceProfileJob = (deps: VoiceProfileJobDeps): VoiceProfileJob => {
  const run = async (force: boolean, signal: AbortSignal): Promise<Result<null, BackgroundJobError>> => {
    // Never overwrite what the user wrote: the moment they edit it, it is theirs.
    if (!force && (await deps.hasProfile())) return err({ kind: 'skipped', message: 'there is already a writing voice' });

    const session = await deps.session();
    if (!session.ok) return err({ kind: 'skipped', message: session.error });

    const answer = await deps.runAgentText({
      prompt: deps.prompt,
      model: session.value.model,
      cwd: session.value.cwd,
      env: session.value.env,
      maxTurns: MAX_TURNS,
      allowedTools: TOOLS,
      hooks: session.value.hooks,
      signal,
    });
    if (!answer.ok) return err({ kind: 'failed', message: answer.error });

    const profile = unfence(answer.value);
    // Too short means it found nothing usable and said so, which is not a profile.
    if (profile.length < MIN_BYTES) return err({ kind: 'skipped', message: 'not enough sent mail to tell how you write yet' });

    const written = await deps.write(profile.slice(0, MAX_BYTES));
    if (!written.ok) return err({ kind: 'failed', message: written.error });
    return ok(null);
  };

  return { run };
};
