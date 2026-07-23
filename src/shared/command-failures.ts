/*
 * Which commands have failed enough times to be worth stopping.
 *
 * The worst conversation in the archive ran the same malformed command ten times, getting
 * the same error every time. The model does not always learn from a failure it can see;
 * this is what lets the guard refuse the third identical attempt and tell it to change
 * approach instead.
 *
 * A small ring buffer of recent failures, per conversation. Pure: the runtime keeps one
 * of these per conversation and threads it into the hook.
 */
export type CommandFailures = {
  // Newest last. Trimmed commands, so whitespace does not make two runs look different.
  readonly recent: readonly string[];
};

// Enough to catch a loop, small enough that a command fixed twenty tries ago is not held
// against a fresh attempt.
const CAPACITY = 20;
// Twice failed is a pattern; a third try unchanged is the loop this exists to break.
const THRESHOLD = 2;

const normalise = (command: string): string => command.replace(/\s+/g, ' ').trim();

export const emptyFailures = (): CommandFailures => ({ recent: [] });

export const recordFailure = (state: CommandFailures, command: string): CommandFailures => {
  const normalised = normalise(command);
  if (normalised.length === 0) return state;
  return { recent: [...state.recent, normalised].slice(-CAPACITY) };
};

// The commands that appear at least THRESHOLD times in the buffer: the ones an identical
// next attempt should be refused.
export const repeatedlyFailed = (state: CommandFailures): readonly string[] => {
  const counts = new Map<string, number>();
  for (const command of state.recent) counts.set(command, (counts.get(command) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count >= THRESHOLD).map(([command]) => command);
};
