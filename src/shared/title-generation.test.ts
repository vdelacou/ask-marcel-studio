import { describe, expect, test } from 'bun:test';
import { buildTitlePrompt, sanitizeGeneratedTitle } from './title-generation.ts';

describe('asking a model to name a conversation', () => {
  test('the model is shown both sides, because a request alone does not say what came of it', () => {
    const prompt = buildTitlePrompt({ userText: 'find the b27 email', assistantText: 'Hervé sent it on 15 July.' });

    expect(prompt).toContain('find the b27 email');
    expect(prompt).toContain('Hervé sent it on 15 July.');
  });

  test('a very long exchange is clipped, so naming a conversation never costs like rereading it', () => {
    const prompt = buildTitlePrompt({ userText: 'x'.repeat(5000), assistantText: 'y'.repeat(5000) });

    expect(prompt.length).toBeLessThan(2600);
  });

  test('the model is told to answer in the language the user used', () => {
    expect(buildTitlePrompt({ userText: 'a', assistantText: 'b' })).toContain('language they used');
  });
});

describe('reading what the model called it', () => {
  test('a plain answer is the title', () => {
    expect(sanitizeGeneratedTitle('Hervé’s B27 budget figures')).toBe('Hervé’s B27 budget figures');
  });

  test('quotes the model wrapped it in are not part of the name', () => {
    expect(sanitizeGeneratedTitle('"Inbox triage for this week"')).toBe('Inbox triage for this week');
  });

  test('a curly-quoted answer is unwrapped too', () => {
    expect(sanitizeGeneratedTitle('“Fendi harmonisation reply”')).toBe('Fendi harmonisation reply');
  });

  test('a fenced answer gives up what is inside the fence', () => {
    expect(sanitizeGeneratedTitle('```\nB27 budget directions\n```')).toBe('B27 budget directions');
  });

  test('a trailing full stop is not part of a name in a list', () => {
    expect(sanitizeGeneratedTitle('Reply to Stella about Hong Kong.')).toBe('Reply to Stella about Hong Kong');
  });

  test('an answer sprawling over lines becomes one line', () => {
    expect(sanitizeGeneratedTitle('Reply to Stella\nabout Hong Kong')).toBe('Reply to Stella about Hong Kong');
  });

  test('a model that answered with a paragraph is cut to ten words', () => {
    expect(sanitizeGeneratedTitle('one two three four five six seven eight nine ten eleven twelve')).toBe('one two three four five six seven eight nine ten');
  });

  test('ten very long words still fit the sidebar', () => {
    const title = sanitizeGeneratedTitle(Array.from({ length: 10 }, () => 'lengthyword').join(' '));

    expect((title ?? '').length).toBeLessThanOrEqual(60);
  });

  test('a refusal is not a title', () => {
    expect(sanitizeGeneratedTitle('I cannot name this conversation.')).toBeUndefined();
    expect(sanitizeGeneratedTitle('Sorry, I do not have enough information.')).toBeUndefined();
  });

  test('an empty answer names nothing', () => {
    expect(sanitizeGeneratedTitle('   ')).toBeUndefined();
    expect(sanitizeGeneratedTitle('```\n\n```')).toBeUndefined();
  });

  test('a title that merely mentions being sorry is still a title', () => {
    expect(sanitizeGeneratedTitle('Apology to Rong Hu about the deadline')).toBe('Apology to Rong Hu about the deadline');
  });
});

describe('the exact words the model is asked', () => {
  test('the prompt is pinned, because changing it changes every title that follows', () => {
    expect(buildTitlePrompt({ userText: 'find the b27 email', assistantText: 'Hervé sent it.' })).toBe(
      [
        'Name this conversation the way a person would name it in a list.',
        '',
        'What they asked:',
        'find the b27 email',
        '',
        'What was answered:',
        'Hervé sent it.',
        '',
        'Reply with the title alone: at most ten words, no quotation marks, no trailing full stop,',
        'no preamble, and never the words "conversation", "chat" or "title". Use the language they used.',
      ].join('\n')
    );
  });

  test('an exchange right on the limit is passed whole, and one character more is cut', () => {
    const exact = 'x'.repeat(1000);

    expect(buildTitlePrompt({ userText: exact, assistantText: 'a' })).toContain(exact);
    expect(buildTitlePrompt({ userText: `${exact}y`, assistantText: 'a' })).toContain(`${exact}…`);
  });
});

describe('the edges of unwrapping what came back', () => {
  test('a fence the model never closed still gives up its contents', () => {
    expect(sanitizeGeneratedTitle('```\nB27 budget directions')).toBe('B27 budget directions');
  });

  test('a labelled fence is handled like a plain one', () => {
    expect(sanitizeGeneratedTitle('```markdown\nInbox triage\n```')).toBe('Inbox triage');
  });

  test('a title that merely contains backticks keeps them', () => {
    expect(sanitizeGeneratedTitle('What `UCR` means')).toBe('What `UCR` means');
  });

  test('a lone fence line says nothing', () => {
    expect(sanitizeGeneratedTitle('```')).toBeUndefined();
  });

  test('a title of exactly ten words is kept whole', () => {
    expect(sanitizeGeneratedTitle('one two three four five six seven eight nine ten')).toBe('one two three four five six seven eight nine ten');
  });

  test('a one-character answer is a title, not a wrapper to strip', () => {
    expect(sanitizeGeneratedTitle('B')).toBe('B');
  });

  test('an answer wrapped in mismatched quotes keeps them, since it may be quoting something', () => {
    expect(sanitizeGeneratedTitle('"Half quoted')).toBe('"Half quoted');
  });
});
