import { describe, expect, test } from 'bun:test';
import { buildGlossaryBlock } from './memory-glossary.ts';

const files = (over: Partial<Parameters<typeof buildGlossaryBlock>[0]> = {}): Parameters<typeof buildGlossaryBlock>[0] => ({ jargon: '', team: '', people: '', ...over });

describe('telling the agent what the user’s words mean', () => {
  test('nothing known adds nothing to the prompt', () => {
    expect(buildGlossaryBlock(files())).toBe('');
  });

  test('notes with only whitespace in them add nothing either', () => {
    expect(buildGlossaryBlock(files({ jargon: '   \n' }))).toBe('');
  });

  test('one note becomes one section', () => {
    const block = buildGlossaryBlock(files({ jargon: '- **QW**: quick win' }));

    expect(block).toContain('- **QW**: quick win');
    expect(block).not.toContain('Their team');
  });

  test('the sections come in a fixed order, so the prompt does not churn', () => {
    const block = buildGlossaryBlock(files({ people: '- **Anna**: client', jargon: '- **QW**: quick win', team: '- **Ben**: design' }));

    expect(block.indexOf('QW')).toBeLessThan(block.indexOf('Ben'));
    expect(block.indexOf('Ben')).toBeLessThan(block.indexOf('Anna'));
  });

  test('notes longer than the cap are cut, and the agent is told where the rest is', () => {
    // This rides along with every message, so a glossary without a limit is a bill
    // without a limit.
    const block = buildGlossaryBlock(files({ jargon: Array.from({ length: 400 }, (_, i) => `- **Term${String(i)}**: something`).join('\n') }), 500);

    expect(block.length).toBeLessThan(700);
    expect(block).toContain('$CLAUDE_CONFIG_DIR/memory/jargon.md');
  });

  test('the cut lands on a whole entry: half of one reads as a fact of its own', () => {
    const block = buildGlossaryBlock(files({ jargon: '- **AAA**: one\n- **BBB**: two\n- **CCC**: three' }), 90);

    expect(block).not.toMatch(/- \*\*[A-Z]+\*\*: *$/m);
  });

  test('a glossary that fits is left whole', () => {
    const block = buildGlossaryBlock(files({ jargon: '- **QW**: quick win' }));

    expect(block).not.toContain('Cut short');
  });
});

describe('the edges of the glossary block', () => {
  test('a glossary exactly at the cap is left whole', () => {
    const block = buildGlossaryBlock(files({ jargon: '- **QW**: quick win' }));

    expect(buildGlossaryBlock(files({ jargon: '- **QW**: quick win' }), block.length)).toBe(block);
  });

  test('each section is headed, so the agent knows which is which', () => {
    const block = buildGlossaryBlock(files({ jargon: '- **QW**: quick win', team: '- **Ben**: design', people: '- **Anna**: client' }));

    expect(block).toContain('Words this user’s organisation uses');
    expect(block).toContain('Their team');
    expect(block).toContain('People they deal with');
  });

  test('the block says whose words these are, so it is not mistaken for the agent’s own', () => {
    expect(buildGlossaryBlock(files({ jargon: '- **QW**: quick win' }))).toContain("What this user's words mean");
  });

  test('only the notes that have something in them get a section', () => {
    const block = buildGlossaryBlock(files({ team: '- **Ben**: design' }));

    expect(block).toContain('Their team');
    expect(block).not.toContain('People they deal with');
  });

  test('space around a note does not survive into the prompt', () => {
    expect(buildGlossaryBlock(files({ jargon: '\n\n- **QW**: quick win\n\n' }))).toContain('- **QW**: quick win');
  });
});

describe('what the block does with whitespace and cut lines', () => {
  test('a note with blank lines around it does not carry them into the prompt', () => {
    const block = buildGlossaryBlock(files({ jargon: '\n\n- **QW**: quick win\n\n', team: '- **Ben**: design' }));

    expect(block).toBe("## What this user's words mean\n\n### Words this user’s organisation uses\n- **QW**: quick win\n\n### Their team\n- **Ben**: design");
  });

  test('the cut drops the line it landed in the middle of', () => {
    const jargon = ['- **AAA**: one', '- **BBB**: two', '- **CCC**: three'].join('\n');
    const whole = buildGlossaryBlock(files({ jargon }));

    const cut = buildGlossaryBlock(files({ jargon }), whole.length - 5);

    expect(cut).not.toContain('CCC');
    expect(cut).toContain('- **BBB**: two');
  });

  test('what survives the cut keeps its line breaks', () => {
    const jargon = ['- **AAA**: one', '- **BBB**: two', '- **CCC**: three'].join('\n');
    const whole = buildGlossaryBlock(files({ jargon }));

    expect(buildGlossaryBlock(files({ jargon }), whole.length - 5)).toContain('- **AAA**: one\n- **BBB**: two');
  });
});
