/*
 * Formats the last turn's token counts (and dollar cost, when the provider reports
 * one) into a compact line for the conversation header. Pure and unit-tested: the
 * header component is props-only (rule 21), so the string is shaped here.
 */
import type { TurnUsage } from '../../../shared/ipc-contract.ts';

export const formatUsage = (usage: TurnUsage | undefined): string => {
  if (usage === undefined) return '';
  const tokens = `${usage.inputTokens} in · ${usage.outputTokens} out`;
  if (usage.costUsd === undefined) return tokens;
  return `${tokens} · $${usage.costUsd.toFixed(4)}`;
};
