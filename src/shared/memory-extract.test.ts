import { describe, expect, test } from 'bun:test';
import { parseMemoryCandidates, renderTranscriptForExtraction } from './memory-extract.ts';
import { unwrap } from './result.ts';
import type { Message } from './types.ts';

const said = (role: 'user' | 'assistant', text: string): Message => ({ id: `${role}-${text}`, role, parts: [{ type: 'text', text }], createdAt: 'now' });

describe('handing a conversation to the model to read', () => {
  test('who said what is kept', () => {
    expect(renderTranscriptForExtraction([said('user', 'another QW this quarter'), said('assistant', 'Noted.')], 0)).toBe('User: another QW this quarter\nAssistant: Noted.');
  });

  test('a tool call collapses to one line: what matters is what was said, not how it was found', () => {
    const withTool: Message = {
      id: 'a',
      role: 'assistant',
      parts: [{ type: 'tool', toolUseId: 't1', name: 'Bash', input: {}, status: 'done', result: 'x'.repeat(9000) }],
      createdAt: 'now',
    };

    expect(renderTranscriptForExtraction([withTool], 0)).toBe('Assistant: [used Bash]');
  });

  test('reading starts where the last pass stopped', () => {
    expect(renderTranscriptForExtraction([said('user', 'old'), said('user', 'new')], 1)).toBe('User: new');
  });

  test('a conversation too long to hand over keeps the recent end', () => {
    // The words worth remembering are the ones just used.
    const rendered = renderTranscriptForExtraction([said('user', 'x'.repeat(200)), said('user', 'the recent one')], 0, 60);

    expect(rendered).toContain('the recent one');
    expect(rendered).toContain('(earlier messages omitted)');
    expect(rendered).not.toContain('x'.repeat(200));
  });

  test('an empty conversation renders to nothing', () => {
    expect(renderTranscriptForExtraction([], 0)).toBe('');
  });

  test('an index past the end renders to nothing rather than throwing', () => {
    expect(renderTranscriptForExtraction([said('user', 'hi')], 9)).toBe('');
  });
});

describe('reading what the model found', () => {
  const answer = (candidates: unknown): string => `Here is what I found.\n\n\`\`\`json\n${JSON.stringify({ candidates })}\n\`\`\``;

  test('a candidate is read out of the fenced answer', () => {
    const found = unwrap(parseMemoryCandidates(answer([{ kind: 'jargon', term: 'QW', detail: 'quick win', quote: 'another QW' }])));

    expect(found).toEqual([{ kind: 'jargon', term: 'QW', detail: 'quick win', alternatives: [], quote: 'another QW' }]);
  });

  test('a bare json answer is read too', () => {
    expect(unwrap(parseMemoryCandidates(JSON.stringify({ candidates: [] })))).toEqual([]);
  });

  test('the last fenced block wins, because a model that thinks out loud answers last', () => {
    const output = `\`\`\`json\n${JSON.stringify({ candidates: [{ kind: 'jargon', term: 'DRAFT', detail: 'ignore me' }] })}\n\`\`\`\nand actually\n\`\`\`json\n${JSON.stringify({ candidates: [{ kind: 'jargon', term: 'REAL', detail: 'this one' }] })}\n\`\`\``;

    expect(unwrap(parseMemoryCandidates(output)).map((c) => c.term)).toEqual(['REAL']);
  });

  test('a candidate with no meaning attached is dropped: there is nothing to ask about', () => {
    expect(unwrap(parseMemoryCandidates(answer([{ kind: 'jargon', term: 'QW' }])))).toEqual([]);
  });

  test('a candidate for a note that does not exist is dropped', () => {
    expect(unwrap(parseMemoryCandidates(answer([{ kind: 'secrets', term: 'x', detail: 'y' }])))).toEqual([]);
  });

  test('an over-long answer is clipped, because these are read into every turn', () => {
    const found = unwrap(parseMemoryCandidates(answer([{ kind: 'people', term: 'A'.repeat(200), detail: 'B'.repeat(900), quote: 'C'.repeat(900) }])));

    expect(found[0]?.term).toHaveLength(80);
    expect(found[0]?.detail).toHaveLength(300);
    expect(found[0]?.quote).toHaveLength(200);
  });

  test('at most three alternatives are offered, and empty ones are dropped', () => {
    const found = unwrap(parseMemoryCandidates(answer([{ kind: 'jargon', term: 'QW', detail: 'quick win', alternatives: ['a', '', 'b', 'c', 'd'] }])));

    expect(found[0]?.alternatives).toEqual(['a', 'b', 'c']);
  });

  test('what a directory lookup added is carried through', () => {
    const found = unwrap(parseMemoryCandidates(answer([{ kind: 'people', term: 'Anna', detail: 'product manager', enrichment: 'anna@example.com' }])));

    expect(found[0]?.enrichment).toBe('anna@example.com');
  });

  test('an answer that is not the expected shape is refused rather than half read', () => {
    expect(parseMemoryCandidates('I could not find anything.').ok).toBe(false);
    expect(parseMemoryCandidates(JSON.stringify({ nope: [] })).ok).toBe(false);
  });
});

describe('the edges of handing a conversation over', () => {
  test('a fence with no language marker is read too', () => {
    expect(unwrap(parseMemoryCandidates('```\n{"candidates":[]}\n```'))).toEqual([]);
  });

  test('an empty enrichment is left off rather than stored as an empty note', () => {
    const found = unwrap(parseMemoryCandidates(JSON.stringify({ candidates: [{ kind: 'people', term: 'Anna', detail: 'product', enrichment: '   ' }] })));

    expect(found[0]).not.toHaveProperty('enrichment');
  });

  test('a transcript exactly at the cap is kept whole', () => {
    const line = 'User: hello';
    const rendered = renderTranscriptForExtraction([{ id: 'a', role: 'user', parts: [{ type: 'text', text: 'hello' }], createdAt: 'now' }], 0, line.length + 1);

    expect(rendered).toBe(line);
  });

  test('a transcript one byte over the cap loses its oldest message', () => {
    const messages = [
      { id: 'a', role: 'user' as const, parts: [{ type: 'text' as const, text: 'old' }], createdAt: 'now' },
      { id: 'b', role: 'user' as const, parts: [{ type: 'text' as const, text: 'new' }], createdAt: 'now' },
    ];

    const rendered = renderTranscriptForExtraction(messages, 0, 'User: new'.length + 1);

    expect(rendered).toBe('(earlier messages omitted)\nUser: new');
  });

  test('what survives the cut keeps its line breaks', () => {
    const messages = Array.from({ length: 3 }, (_, index) => ({
      id: `m${String(index)}`,
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: `line ${String(index)}` }],
      createdAt: 'now',
    }));

    const rendered = renderTranscriptForExtraction(messages, 0, 'User: line 1'.length * 2 + 2);

    expect(rendered).toBe('(earlier messages omitted)\nUser: line 1\nUser: line 2');
  });
});
