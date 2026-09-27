import { describe, expect, test } from 'bun:test';
import { createClaudePlanModels } from './claude-plan-models.ts';
import type { ClaudeModelList, ClaudeModelListOutcome } from './claude-plan-models.ts';

// Entries as `supportedModels()` answered them from the bundled Claude Code 2.1.185.
const listed = [
  { value: 'opus[1m]', displayName: 'Opus', description: 'Opus 4.8 with 1M context' },
  { value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet 4.6' },
];

const answering = (outcome: ClaudeModelListOutcome): { readonly list: ClaudeModelList; readonly deadlines: number[] } => {
  const deadlines: number[] = [];
  const list: ClaudeModelList = async (timeoutMs) => {
    deadlines.push(timeoutMs);
    return outcome;
  };
  return { list, deadlines };
};

describe('asking Claude Code which models the plan offers', () => {
  test('the models are asked of Claude Code itself', async () => {
    const { list, deadlines } = answering({ listed: true, models: listed });

    const result = await createClaudePlanModels(list).list();

    expect(deadlines).toEqual([15_000]);
    expect(result).toEqual({
      ok: true,
      value: [
        { id: 'opus[1m]', label: 'Opus', description: 'Opus 4.8 with 1M context' },
        { id: 'sonnet', label: 'Sonnet', description: 'Sonnet 4.6' },
      ],
    });
  });

  test('a Claude Code that cannot start is reported as such', async () => {
    const { list } = answering({ listed: false, timedOut: false, message: 'spawn ENOENT' });

    expect(await createClaudePlanModels(list).list()).toEqual({ ok: false, error: { kind: 'spawn-failed', message: 'spawn ENOENT' } });
  });

  test('a list that does not come back within the deadline is reported as timed out', async () => {
    const { list } = answering({ listed: false, timedOut: true, message: 'aborted' });

    const result = await createClaudePlanModels(list).list();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('timed-out');
  });

  test('a list in a shape nobody can read is reported, not guessed', async () => {
    const { list } = answering({ listed: true, models: 'nope' });

    const result = await createClaudePlanModels(list).list();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unreadable');
  });
});
