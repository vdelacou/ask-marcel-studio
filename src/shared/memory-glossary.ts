/*
 * The block of the user's own vocabulary that rides along with every turn.
 *
 * Small on purpose: it is prepended to every message the agent ever sees, so a glossary
 * that grows without limit is a bill that grows without limit. Past the cap it stops at
 * a whole entry and tells the agent where the rest is.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */

export type GlossaryFiles = {
  readonly jargon: string;
  readonly team: string;
  readonly people: string;
};

const CAP_BYTES = 4_096;

const SECTIONS: readonly { readonly key: keyof GlossaryFiles; readonly heading: string }[] = [
  { key: 'jargon', heading: 'Words this user’s organisation uses' },
  { key: 'team', heading: 'Their team' },
  { key: 'people', heading: 'People they deal with' },
];

const TRUNCATION_NOTE = '\n(Cut short. The full notes are at $CLAUDE_CONFIG_DIR/memory/jargon.md, team.md and people.md: read them when a word or a name is unfamiliar.)';

export const buildGlossaryBlock = (files: GlossaryFiles, capBytes = CAP_BYTES): string => {
  const sections = SECTIONS.filter((section) => files[section.key].trim().length > 0).map((section) => `### ${section.heading}\n${files[section.key].trim()}`);
  if (sections.length === 0) return '';

  const block = `## What this user's words mean\n\n${sections.join('\n\n')}`;
  if (block.length <= capBytes) return block;

  // Cut at a line boundary: half an entry reads as a fact of its own.
  const lines = block.slice(0, capBytes).split('\n');
  return `${lines.slice(0, -1).join('\n')}${TRUNCATION_NOTE}`;
};
