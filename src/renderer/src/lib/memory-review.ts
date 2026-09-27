/*
 * The answers being written on the review list.
 *
 * Nothing asks the user anything any more: the things Marcel noticed wait in a list the
 * user opens when they feel like it, and every row on that list holds an answer of its
 * own. So the draft is a map keyed by candidate, not a single question's state, and a row
 * left half-written stays half-written while its neighbours are dealt with.
 *
 * A row starts on the wording Marcel suggested, which is what makes "Remember it" a single
 * click for the common case. Its box shows the wording picked until the user types over it:
 * `selected` undefined means the box holds their own words. Picking another of the wordings
 * Marcel offered puts that one in the box instead.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import type { MemoryCandidate } from '../../../shared/memory-queue-doc.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';

export type MemoryDraft = {
  // The wording picked from the offered ones, or undefined while the user writes their own.
  readonly selected?: string;
  readonly own: string;
  // What the user typed over the word Marcel heard. Undefined means they have not touched
  // it and it stands as proposed; '' means they cleared the box and are mid-retype, which
  // is why this is not simply defaulted to the proposed word.
  readonly term?: string;
  // The list the user filed it under instead of the one Marcel guessed, if they picked one.
  readonly kind?: MemoryFileName;
};

export type MemoryDrafts = Readonly<Record<string, MemoryDraft>>;

export const emptyDrafts: MemoryDrafts = {};

// What Marcel suggested, then the other phrasings it offered. Deduped, because the model is
// asked for alternatives and sometimes repeats itself, and a list showing the same sentence
// twice reads as a bug.
export const choicesFor = (candidate: MemoryCandidate): readonly string[] => {
  const seen = new Set<string>();
  return [candidate.suggestedDetail, ...candidate.alternatives].filter((choice) => {
    if (choice.length === 0 || seen.has(choice)) return false;
    seen.add(choice);
    return true;
  });
};

export const draftFor = (drafts: MemoryDrafts, candidate: MemoryCandidate): MemoryDraft => {
  const held = drafts[candidate.id];
  if (held !== undefined) return held;
  const first = choicesFor(candidate)[0];
  return first === undefined ? { own: '' } : { selected: first, own: '' };
};

export const withChoice = (drafts: MemoryDrafts, candidate: MemoryCandidate, choice: string): MemoryDrafts => ({
  ...drafts,
  [candidate.id]: { ...draftFor(drafts, candidate), selected: choice },
});

// Moving to your own words drops the wording that was picked; a word corrected on the way
// past, and a list picked for it, are not part of that and stay.
export const withOwnWords = (drafts: MemoryDrafts, candidate: MemoryCandidate, text: string): MemoryDrafts => {
  const { selected, ...kept } = draftFor(drafts, candidate);
  return { ...drafts, [candidate.id]: { ...kept, own: text } };
};

export const withKind = (drafts: MemoryDrafts, candidate: MemoryCandidate, kind: MemoryFileName): MemoryDrafts => ({
  ...drafts,
  [candidate.id]: { ...draftFor(drafts, candidate), kind },
});

// Where the answer would be filed: the list the user picked, or the one Marcel guessed.
export const kindFor = (drafts: MemoryDrafts, candidate: MemoryCandidate): MemoryFileName => drafts[candidate.id]?.kind ?? candidate.kind;

export const withTerm = (drafts: MemoryDrafts, candidate: MemoryCandidate, text: string): MemoryDrafts => ({
  ...drafts,
  [candidate.id]: { ...draftFor(drafts, candidate), term: text },
});

// What the box shows: what they typed, or the word Marcel heard until they type.
export const termTextFor = (drafts: MemoryDrafts, candidate: MemoryCandidate): string => drafts[candidate.id]?.term ?? candidate.term;

// The word that would be filed, or nothing at all: a row with the word rubbed out has no
// heading to file the meaning under, so it refuses to be remembered.
export const termFor = (drafts: MemoryDrafts, candidate: MemoryCandidate): string | undefined => {
  const term = termTextFor(drafts, candidate).trim();
  return term.length === 0 ? undefined : term;
};

// What the row would have Marcel remember, or nothing at all: an empty answer is not an
// answer, and the row refuses to be remembered rather than storing a blank definition.
export const answerFor = (draft: MemoryDraft): string | undefined => {
  const answer = (draft.selected ?? draft.own).trim();
  return answer.length === 0 ? undefined : answer;
};

// A row ready to be remembered, as it stands: its wording, its word and its list.
export type MemoryAnswer = { readonly id: string; readonly detail: string; readonly term: string; readonly kind: MemoryFileName };

// Nothing for a row with no meaning or with its word rubbed out: the same two rules that keep
// its own Remember button refused.
export const answerOf = (drafts: MemoryDrafts, candidate: MemoryCandidate): MemoryAnswer | undefined => {
  const detail = answerFor(draftFor(drafts, candidate));
  const term = termFor(drafts, candidate);
  return detail === undefined || term === undefined ? undefined : { id: candidate.id, detail, term, kind: kindFor(drafts, candidate) };
};

// Remember all: every row that can be remembered, in the order they are listed.
export const answersFor = (drafts: MemoryDrafts, candidates: readonly MemoryCandidate[]): readonly MemoryAnswer[] =>
  candidates.flatMap((candidate) => answerOf(drafts, candidate) ?? []);

export const forgetDraft = (drafts: MemoryDrafts, id: string): MemoryDrafts => {
  const { [id]: gone, ...rest } = drafts;
  return rest;
};
