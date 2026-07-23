/*
 * What an answer cost, in one faint line under it.
 *
 * Not an analytics panel: the point is that a turn which ran forty commands and had six
 * of them fail should look different from one that answered straight away, without
 * anybody opening a card to find out.
 *
 * Pure: no react, no electron.
 */
export type TurnStatsView = {
  readonly durationMs: number;
  readonly toolCalls: number;
  readonly toolErrors: number;
};

const MINUTE_MS = 60_000;

// Seconds up to ninety, then minutes: "94s" makes a reader do arithmetic.
const duration = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(ms / MINUTE_MS);
  return `${minutes}m`;
};

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

// Undefined when there is nothing worth saying: a turn with no tools and no time recorded
// is just an answer, and a line saying so would be noise under every reply.
export const formatTurnStats = (stats: TurnStatsView | undefined): string | undefined => {
  if (stats === undefined) return undefined;
  const parts = [
    duration(stats.durationMs),
    ...(stats.toolCalls === 0 ? [] : [plural(stats.toolCalls, 'step', 'steps')]),
    ...(stats.toolErrors === 0 ? [] : [plural(stats.toolErrors, 'failed', 'failed')]),
  ];
  return parts.join(' · ');
};
