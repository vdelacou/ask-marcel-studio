/*
 * "Clear all memories": everything the Memory page holds, gone at once. The words and people,
 * the suggestions waiting and the words skipped, and the three documents about the user (who
 * they are, how they write, their signature). An erasure the user asked for, so the files are
 * emptied rather than set aside: nothing is kept to bring back.
 *
 * Best effort: what can be cleared is, and what could not be is named, so a second try has
 * something to aim at. The reading progress stays, so old conversations are not read again
 * for what was just cleared.
 */
import type { AgentFileDoc } from '../../../shared/agent-files.ts';
import type { StoreError } from '../../../shared/ipc-contract.ts';
import { err, ok } from '../../../shared/result.ts';
import type { Result } from '../../../shared/result.ts';

export type ClearAllDeps = {
  readonly clearMemory: () => Promise<Result<null, StoreError>>;
  readonly clearDocument: (doc: AgentFileDoc) => Promise<Result<unknown, { readonly message: string }>>;
};

// The documents the store keeps, each named as a message would name it. A Record, so a new
// kind of document fails to compile here until it is named, and so cleared.
const DOCUMENTS: Readonly<Record<AgentFileDoc, string>> = { 'global-context': 'Who you are', 'voice-profile': 'your writing voice', signature: 'your email signature' };

const isDocument = (key: string): key is AgentFileDoc => Object.hasOwn(DOCUMENTS, key);

const listed = (names: readonly string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.slice(-1).join('')}`);

export const createClearAll = (deps: ClearAllDeps) => async (): Promise<Result<null, StoreError>> => {
  const memory = await deps.clearMemory();
  const failed: string[] = memory.ok ? [] : ['your words, people and suggestions'];
  for (const doc of Object.keys(DOCUMENTS).filter(isDocument)) {
    const cleared = await deps.clearDocument(doc);
    if (!cleared.ok) failed.push(DOCUMENTS[doc]);
  }
  if (failed.length === 0) return ok(null);
  return err({ kind: 'write-failed', message: `Could not clear ${listed(failed)}. Everything else was cleared, so try again.` });
};
