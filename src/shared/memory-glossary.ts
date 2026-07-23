/*
 * The user's own notes, as the blocks that ride along with every turn.
 *
 * Three notes, three blocks, never merged into one. Each carries its own heading saying
 * what it holds, so the agent is reading "their team" as a thing in its own right rather
 * than one third of an undifferentiated wall, and so a note that is empty simply is not
 * there instead of leaving a bare heading behind.
 *
 * The limit stays on the note, where it always was: each of the three is capped where it
 * is written. What went with the single block is the backstop that capped the assembled
 * one, which had nothing left to guard once there is no assembled block.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import { withoutHeading } from './memory-doc.ts';

export type GlossaryFiles = {
  readonly jargon: string;
  readonly team: string;
  readonly people: string;
};

// What one note may hold. Roughly 500 tokens: twenty-odd entries, which is a glossary
// rather than a dictionary. The panel counts down to it and will not save past it.
export const NOTE_LIMIT = 2_000;

export const roomLeftInNote = (text: string): number => NOTE_LIMIT - text.length;

export const isNoteTooLong = (text: string): boolean => text.length > NOTE_LIMIT;

const SECTIONS: readonly { readonly key: keyof GlossaryFiles; readonly heading: string }[] = [
  { key: 'jargon', heading: 'Words this user’s organisation uses' },
  { key: 'team', heading: 'Their team' },
  { key: 'people', heading: 'People they deal with' },
];

// One block per note that has something in it. A note written before notes stopped
// carrying titles has its old heading dropped here too, so a stale one never reaches the
// model competing with the heading this adds.
export const buildGlossaryBlocks = (files: GlossaryFiles): readonly string[] =>
  SECTIONS.flatMap((section) => {
    const body = withoutHeading(files[section.key]).trim();
    return body.length === 0 ? [] : [`## ${section.heading}\n${body}`];
  });
