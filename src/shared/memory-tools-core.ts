/*
 * What the agent's memory tools say, without the SDK or the store.
 *
 * The pure decisions behind memory_search / memory_add / memory_forget: what a search
 * returns to the model, what an empty query or an unknown id is told, and the wording that
 * keeps the model honest about only adding or forgetting on the user's say-so. Kept here so
 * they are tested; the MCP server is the thin wiring.
 */
import type { MemoryItem } from './memory-store.ts';

// What the model is shown for a search. Numbered with ids visible, so it can quote a
// memory and, if the user asks, forget one by naming it. Newest-relevant first is the
// store's job; this just renders.
export const renderSearchResult = (memories: readonly MemoryItem[]): string => {
  if (memories.length === 0) return 'No memories match that. Say so plainly rather than guessing, or search a different way.';
  const lines = memories.map((memory, index) => `${index + 1}. [${memory.id}] ${memory.text}`);
  return ['Relevant memories:', ...lines].join('\n');
};

// A search with nothing to search for.
export const emptySearchRefusal = (): string => 'A memory search needs something to look for: a term, a person, or a topic. Nothing was given.';

export const addConfirmation = (text: string): string => `Remembered: "${text}". It will show on the Memory page, where the user can edit or remove it.`;

export const forgetConfirmation = (text: string): string => `Forgotten: "${text}".`;

export const forgetNotFound = (id: string): string => `There is no memory with id ${id} to forget. Search first to find the right id.`;

// A default, so a model that omits the count still gets a useful search rather than one
// hit or a hundred.
export const DEFAULT_SEARCH_LIMIT = 5;

export const clampSearchLimit = (raw: number | undefined): number => {
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_SEARCH_LIMIT;
  return Math.min(20, Math.max(1, Math.floor(raw)));
};
