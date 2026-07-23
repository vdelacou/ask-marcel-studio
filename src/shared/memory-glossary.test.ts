import { describe, expect, test } from 'bun:test';
import { buildGlossaryBlocks } from './memory-glossary.ts';
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

  test('a note far past what used to be the cap is passed whole, because there is no cap any more', () => {
    const long = `- **PAD**: ${'x'.repeat(20_000)}`;

    const blocks = buildGlossaryBlocks(files({ jargon: long }));

    expect(blocks[0]).toContain(long);
    expect(blocks[0]).not.toContain('Cut short');
  });
});
