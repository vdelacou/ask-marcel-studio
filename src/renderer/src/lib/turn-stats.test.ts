import { describe, expect, test } from 'bun:test';
import { formatTurnStats } from './turn-stats.ts';

describe('saying what an answer cost', () => {
  test('a quick answer with a few steps reads as one short line', () => {
    expect(formatTurnStats({ durationMs: 14_000, toolCalls: 4, toolErrors: 0 })).toBe('14s · 4 steps');
  });

  test('a turn where things went wrong says so, because that is the useful part', () => {
    expect(formatTurnStats({ durationMs: 92_000, toolCalls: 76, toolErrors: 22 })).toBe('2m · 76 steps · 22 failed');
  });

  test('one step is a step, not 1 steps', () => {
    expect(formatTurnStats({ durationMs: 3000, toolCalls: 1, toolErrors: 0 })).toBe('3s · 1 step');
  });

  test('an answer that ran nothing just says how long it took', () => {
    expect(formatTurnStats({ durationMs: 2000, toolCalls: 0, toolErrors: 0 })).toBe('2s');
  });

  test('under ninety seconds stays in seconds, so nobody has to do arithmetic', () => {
    expect(formatTurnStats({ durationMs: 89_000, toolCalls: 0, toolErrors: 0 })).toBe('89s');
    expect(formatTurnStats({ durationMs: 90_000, toolCalls: 0, toolErrors: 0 })).toBe('2m');
  });

  test('a turn from before this was recorded shows no line at all', () => {
    expect(formatTurnStats(undefined)).toBeUndefined();
  });

  test('a nonsense negative duration reads as no time rather than as minus a minute', () => {
    expect(formatTurnStats({ durationMs: -5000, toolCalls: 0, toolErrors: 0 })).toBe('0s');
  });
});
