/*
 * Reads the always-on Microsoft 365 core that agent-runtime appends to every turn's
 * system prompt.
 *
 * An IO shell: the one try/catch lives here (rule 17), not in the composition root, so
 * index.ts stays catch-free. An unreadable or absent bundled file yields an empty core
 * — the agent still works through its skills — rather than crashing startup. Path
 * resolution (dev vs packaged) stays in the composition root, which owns that decision.
 */
import { readFileSync } from 'node:fs';

export const readAgentCore = (source: string): string => readBundledText(source);

// The same read, named for the general case: the background prompts ship the same way
// and degrade the same way (an absent one means that job skips, not that the app dies).
export const readBundledText = (source: string): string => {
  try {
    return readFileSync(source, 'utf8');
  } catch {
    return '';
  }
};
