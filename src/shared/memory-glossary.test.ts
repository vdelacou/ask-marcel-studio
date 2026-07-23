import { describe, expect, test } from 'bun:test';
import { buildGlossaryBlocks, isNoteTooLong, NOTE_LIMIT, roomLeftInNote } from './memory-glossary.ts';
import type { GlossaryFiles } from './memory-glossary.ts';

const files = (over: Partial<GlossaryFiles> = {}): GlossaryFiles => ({ jargon: '', team: '', people: '', ...over });

describe('telling the agent what the user’s words mean', () => {
  test('nothing known adds nothing to the prompt', () => {
    expect(buildGlossaryBlocks(files())).toEqual([]);
  });

  test('notes with only whitespace in them add nothing either', () => {
    expect(buildGlossaryBlocks(files({ jargon: '   \n\n  ', team: '\n' }))).toEqual([]);
  });

  test('one note becomes one block', () => {
    expect(buildGlossaryBlocks(files({ jargon: '- **TLA**: three-letter acronym' }))).toEqual(['## Words this user’s organisation uses\n- **TLA**: three-letter acronym']);
  });

  test('three notes stay three blocks, so no note is read as part of another', () => {
    const blocks = buildGlossaryBlocks({ jargon: '- **TLA**: acronym', team: '- **Anna**: product', people: '- **Bo**: the auditor' });

    expect(blocks).toHaveLength(3);
    expect(blocks.every((block) => block.startsWith('## '))).toBe(true);
  });

  test('only the notes that have something in them get a block', () => {
    expect(buildGlossaryBlocks(files({ team: '- **Anna**: product' }))).toEqual(['## Their team\n- **Anna**: product']);
  });

  test('the blocks come in a fixed order, so the prompt does not churn between turns', () => {
    const blocks = buildGlossaryBlocks({ people: '- **Bo**: auditor', jargon: '- **TLA**: acronym', team: '- **Anna**: product' });

    expect(blocks.map((block) => block.split('\n')[0])).toEqual(['## Words this user’s organisation uses', '## Their team', '## People they deal with']);
  });

  test('each block is headed, so the agent knows which note it is reading', () => {
    const blocks = buildGlossaryBlocks(files({ people: '- **Bo**: the auditor' }));

    expect(blocks[0]).toContain('## People they deal with');
    expect(blocks[0]).toContain('- **Bo**: the auditor');
  });

  test('space around a note does not survive into the prompt', () => {
    expect(buildGlossaryBlocks(files({ jargon: '\n\n  - **TLA**: acronym  \n\n' }))).toEqual(['## Words this user’s organisation uses\n- **TLA**: acronym']);
  });

  test('a note saved when notes still carried titles does not bring its old one along', () => {
    expect(buildGlossaryBlocks(files({ jargon: '# Words we use\n\n- **TLA**: acronym' }))).toEqual(['## Words this user’s organisation uses\n- **TLA**: acronym']);
  });

  test('a note keeps its own line breaks, because the entries are lines', () => {
    expect(buildGlossaryBlocks(files({ jargon: '- **A**: first\n- **B**: second' }))).toEqual(['## Words this user’s organisation uses\n- **A**: first\n- **B**: second']);
  });
});

describe('the cap on a note, and why it is where it is', () => {
  test('three notes filled to the limit are still passed whole', () => {
    // The invariant the whole design rests on: what the panel lets you save is what the
    // agent reads. Splitting the block into three is what retired the second cap; if
    // this ever fails, the note limit grew and nothing caught it.
    const full = 'x'.repeat(NOTE_LIMIT);

    const blocks = buildGlossaryBlocks({ jargon: full, team: full, people: full });

    expect(blocks.every((block) => block.includes(full))).toBe(true);
  });

  test('a note at exactly the limit is allowed, one character more is not', () => {
    expect(isNoteTooLong('x'.repeat(NOTE_LIMIT))).toBe(false);
    expect(isNoteTooLong('x'.repeat(NOTE_LIMIT + 1))).toBe(true);
  });

  test('an empty note has the whole limit left, and a full one has none', () => {
    expect(roomLeftInNote('')).toBe(NOTE_LIMIT);
    expect(roomLeftInNote('x'.repeat(NOTE_LIMIT))).toBe(0);
  });

  test('past the limit the room left goes negative, so the panel can say by how much', () => {
    expect(roomLeftInNote('x'.repeat(NOTE_LIMIT + 12))).toBe(-12);
  });
});
