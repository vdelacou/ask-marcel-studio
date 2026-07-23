/*
 * The always-on blocks the agent gets on every turn, besides the M365 core.
 *
 * Three things ride along: what the user wrote about themselves (global context), who they
 * are from the directory (quick context), and the reminder that a searchable memory
 * exists. This assembles them in a stable order, dropping any that are empty, so an empty
 * About-you file adds nothing and the prompt does not grow a blank heading.
 *
 * Pure: the pieces are fetched by the composition root; this only orders and frames them.
 */
export type ContextBlockInput = {
  // What the user typed in Settings > About you. Framed with a heading here; stored raw.
  readonly aboutYou: string;
  readonly quickContext: string;
  readonly memoryPreamble: string;
};

const aboutYouBlock = (text: string): string => {
  const trimmed = text.trim();
  return trimmed.length === 0 ? '' : ['## About the person you work for', '', trimmed].join('\n');
};

// The order is deliberate: who they are and what matters to them first, then the directory
// facts, then the memory reminder. Empty blocks are dropped so nothing frames a void.
export const buildContextBlocks = (input: ContextBlockInput): readonly string[] =>
  [aboutYouBlock(input.aboutYou), input.quickContext, input.memoryPreamble].filter((block) => block.trim().length > 0);
