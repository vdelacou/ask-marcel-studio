import { describe, expect, test } from 'bun:test';
import { formatUsage } from './format-usage.ts';

describe('showing the cost of the last turn', () => {
  test('before any turn completes, there is nothing to show', () => {
    expect(formatUsage(undefined)).toBe('');
  });

  test('a completed turn shows tokens in and out', () => {
    expect(formatUsage({ inputTokens: 12, outputTokens: 8 })).toBe('12 in · 8 out');
  });

  test('when the provider reports a dollar cost, it is appended', () => {
    expect(formatUsage({ inputTokens: 1200, outputTokens: 800, costUsd: 0.0123 })).toBe('1200 in · 800 out · $0.0123');
  });
});
