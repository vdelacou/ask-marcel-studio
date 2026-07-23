/*
 * The user's own notes, as the blocks that ride along with every turn.
 *
 * Three notes, three blocks, never merged into one. Each carries its own heading saying
 * what it holds, so the agent is reading "their team" as a thing in its own right rather
 * than one third of an undifferentiated wall, and so a note that is empty simply is not
 * there instead of leaving a bare heading behind.
 *
 * Nothing here is capped. That is deliberate and it has a price: every note is read before
 * every message, so what is written in them is paid for on every turn, and a note that
 * grows keeps costing more. The user asked for the limit to go, having been the one who
 * writes them; the app no longer second-guesses that.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import { withoutHeading } from './memory-doc.ts';

export type GlossaryFiles = {
  readonly jargon: string;
  readonly team: string;
  readonly people: string;
};

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
