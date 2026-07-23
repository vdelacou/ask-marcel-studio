import { describe, expect, test } from 'bun:test';
import { formatLogLine, shouldRotate } from './log-line.ts';

describe('a log line', () => {
  test('is one JSON object with a time, a level and an event', () => {
    const line = formatLogLine({ at: '2026-07-24T00:00:00.000Z', level: 'info', event: 'turn-saved' });

    expect(JSON.parse(line)).toEqual({ at: '2026-07-24T00:00:00.000Z', level: 'info', event: 'turn-saved' });
    expect(line.endsWith('\n')).toBe(true);
  });

  test('carries its fields flattened alongside the event', () => {
    const line = formatLogLine({ at: '2026-07-24T00:00:00.000Z', level: 'info', event: 'turn-saved', fields: { conversationId: 'c1', toolCalls: 4, hadError: true } });

    expect(JSON.parse(line)).toMatchObject({ event: 'turn-saved', conversationId: 'c1', toolCalls: 4, hadError: true });
  });

  test('clamps an oversized string field, so a mistake truncates rather than leaks a mail body', () => {
    const line = formatLogLine({ at: '2026-07-24T00:00:00.000Z', level: 'warn', event: 'oops', fields: { detail: 'x'.repeat(500) } });

    expect((JSON.parse(line) as { detail: string }).detail.length).toBeLessThan(210);
    expect((JSON.parse(line) as { detail: string }).detail.endsWith('…')).toBe(true);
  });

  test('a number field is not clamped or stringified', () => {
    const line = formatLogLine({ at: '2026-07-24T00:00:00.000Z', level: 'info', event: 'e', fields: { durationMs: 14000 } });

    expect((JSON.parse(line) as { durationMs: number }).durationMs).toBe(14000);
  });
});

describe('deciding when to roll the file over', () => {
  test('at the cap it rotates', () => {
    expect(shouldRotate(5_000_000, 5_000_000)).toBe(true);
  });

  test('under the cap it does not', () => {
    expect(shouldRotate(4_999_999, 5_000_000)).toBe(false);
  });
});
