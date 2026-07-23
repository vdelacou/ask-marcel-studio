/*
 * Carrying the old jargon/team/people notes into the searchable memory.
 *
 * The notes were three markdown files of "term: detail" lines, injected wholesale into
 * every prompt. The searchable memory keeps each fact as one sentence and searches it
 * instead. This turns the notes into those sentences, once, so nothing the user taught the
 * agent is lost in the switch.
 *
 * Pure: the reading and writing are the migration service's; this decides what a note
 * becomes.
 */
import { parseMemoryDoc } from './memory-doc.ts';

// One fact ready to be added, as the store's add takes it.
export type MigratedFact = { readonly text: string };

// A note's entries become "term: detail" sentences; a raw line the parser saw as prose (a
// heading, or a free-form line the user typed by hand) migrates verbatim rather than being
// dropped, as long as it is not a bare heading.
const factsFromNote = (contents: string): readonly MigratedFact[] => {
  const doc = parseMemoryDoc(contents);
  return doc.lines.flatMap((line): readonly MigratedFact[] => {
    if (line.kind === 'entry') return [{ text: line.entry.detail.length > 0 ? `${line.entry.term}: ${line.entry.detail}` : line.entry.term }];
    const raw = line.text.trim();
    return raw.length === 0 || raw.startsWith('#') ? [] : [{ text: raw }];
  });
};

// Every fact across the three notes, deduped by text so a relaunch after a partial
// migration does not double anything.
export const notesToFacts = (notes: { readonly jargon: string; readonly team: string; readonly people: string }): readonly MigratedFact[] => {
  const all = [...factsFromNote(notes.jargon), ...factsFromNote(notes.team), ...factsFromNote(notes.people)];
  const seen = new Set<string>();
  return all.filter((fact) => {
    if (fact.text.length === 0 || seen.has(fact.text)) return false;
    seen.add(fact.text);
    return true;
  });
};
