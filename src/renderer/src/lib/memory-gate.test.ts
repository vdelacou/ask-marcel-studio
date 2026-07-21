import { describe, expect, test } from 'bun:test';
import { shouldOpenMemoryDialog } from './memory-gate.ts';
import type { MemoryGateInput } from './memory-gate.ts';

const idle = (over: Partial<MemoryGateInput> = {}): MemoryGateInput => ({
  pendingCount: 1,
  streamingCount: 0,
  composerEmpty: true,
  settingsOpen: false,
  dialogOpen: false,
  snoozed: false,
  ...over,
});

describe('choosing a polite moment to ask', () => {
  test('with something to ask and nothing happening, it asks', () => {
    expect(shouldOpenMemoryDialog(idle())).toBe(true);
  });

  test('with nothing to ask it stays quiet', () => {
    expect(shouldOpenMemoryDialog(idle({ pendingCount: 0 }))).toBe(false);
  });

  test('it never interrupts a turn, even one in another conversation', () => {
    expect(shouldOpenMemoryDialog(idle({ streamingCount: 1 }))).toBe(false);
  });

  test('it never interrupts someone mid-sentence', () => {
    expect(shouldOpenMemoryDialog(idle({ composerEmpty: false }))).toBe(false);
  });

  test('it waits until settings are closed', () => {
    expect(shouldOpenMemoryDialog(idle({ settingsOpen: true }))).toBe(false);
  });

  test('it does not open on top of itself', () => {
    expect(shouldOpenMemoryDialog(idle({ dialogOpen: true }))).toBe(false);
  });

  test('waved away, it stays away', () => {
    expect(shouldOpenMemoryDialog(idle({ snoozed: true }))).toBe(false);
  });

  test('several things waiting is still one question', () => {
    expect(shouldOpenMemoryDialog(idle({ pendingCount: 5 }))).toBe(true);
  });
});
