/*
 * Stepping back through what you already sent, the way a shell does.
 *
 * Depth counts from the newest: 1 is the last message sent, 2 the one before. Undefined
 * means the box holds the user's own unsent text and we are not browsing at all, which is
 * what tells the composer to let the arrows move the caret again.
 *
 * `pending` is whatever was in the box when browsing started. Coming back down past the
 * newest message restores it rather than clearing the box: a half-typed thought that
 * disappeared because someone reached for the wrong arrow is a small betrayal.
 *
 * Pure: undefined means "this key does nothing here", so the shell has one thing to check
 * and the component has none.
 */

export type HistoryStep = {
  readonly draft: string;
  readonly depth?: number;
};

export type HistoryInput = {
  // Oldest first, the order the transcript has them in.
  readonly entries: readonly string[];
  readonly depth?: number;
  readonly pending: string;
  // -1 is further back, 1 is back towards what you were typing.
  readonly direction: 1 | -1;
};

// Never indexes out of range: the callers below check the bounds first. The fallback is
// there so this returns a string rather than needing a non-null assertion.
const at = (entries: readonly string[], depth: number): string => entries[entries.length - depth] ?? '';

export const stepHistory = ({ entries, depth, pending, direction }: HistoryInput): HistoryStep | undefined => {
  if (direction === -1) {
    const older = (depth ?? 0) + 1;
    return older > entries.length ? undefined : { draft: at(entries, older), depth: older };
  }
  // Not browsing: there is nothing newer than the text already in the box.
  if (depth === undefined) return undefined;
  const newer = depth - 1;
  return newer === 0 ? { draft: pending } : { draft: at(entries, newer), depth: newer };
};
