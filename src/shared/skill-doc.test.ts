import { describe, expect, test } from 'bun:test';
import { parseSkillDoc, serialiseSkillDoc, foldToSingleLine } from './skill-doc.ts';

describe('editing a skill as fields plus a body', () => {
  const source = ['---', 'name: my-skill', 'displayName: My Skill', 'description: Does a thing.', 'license: MIT', '---', '', '# The body', '', 'Instructions here.', ''].join('\n');

  test('the fields and the body come apart the way a form would show them', () => {
    const doc = parseSkillDoc(source);
    if (!doc.ok) throw new Error('should parse');

    expect(doc.value.name).toBe('my-skill');
    expect(doc.value.displayName).toBe('My Skill');
    expect(doc.value.description).toBe('Does a thing.');
    expect(doc.value.body).toContain('# The body');
  });

  test('a frontmatter key this app does not model is kept, not dropped', () => {
    const doc = parseSkillDoc(source);

    expect(doc.ok && doc.value.extras).toEqual([{ key: 'license', value: 'MIT' }]);
  });

  test('editing only the body leaves every frontmatter value byte-identical', () => {
    const doc = parseSkillDoc(source);
    if (!doc.ok) throw new Error('should parse');

    const rewritten = serialiseSkillDoc({ ...doc.value, body: 'A different body.' });
    const reparsed = parseSkillDoc(rewritten);

    expect(reparsed.ok && reparsed.value.name).toBe('my-skill');
    expect(reparsed.ok && reparsed.value.displayName).toBe('My Skill');
    expect(reparsed.ok && reparsed.value.extras).toEqual([{ key: 'license', value: 'MIT' }]);
  });

  test('a description typed across three lines is stored as one the parser reads whole', () => {
    const doc = { name: 'mine', description: 'first line\nsecond line\nthird line', extras: [], body: 'Body.' };

    const round = parseSkillDoc(serialiseSkillDoc(doc));

    expect(round.ok && round.value.description).toBe('first line second line third line');
  });

  test('a description that begins and ends with a quote survives the round trip', () => {
    const doc = { name: 'mine', description: '"a quoted thing"', extras: [], body: 'Body.' };

    const round = parseSkillDoc(serialiseSkillDoc(doc));

    expect(round.ok && round.value.description).toBe('"a quoted thing"');
  });

  test('a description that merely contains a colon is left bare and read back whole', () => {
    const doc = { name: 'mine', description: 'Reply to X: say yes', extras: [], body: 'Body.' };

    const round = parseSkillDoc(serialiseSkillDoc(doc));

    expect(round.ok && round.value.description).toBe('Reply to X: say yes');
  });

  test('folding collapses tabs and runs of space to a single space', () => {
    expect(foldToSingleLine('a\t\tb   c\nd')).toBe('a b c d');
  });
});

describe('folding and quoting at the edges', () => {
  test('a name with a colon in it is left bare and read back whole, colon and all', () => {
    const round = parseSkillDoc(serialiseSkillDoc({ name: 'a:b', description: 'x.', extras: [], body: 'B.' }));

    expect(round.ok && round.value.name).toBe('a:b');
  });

  test('a single quote character is not treated as a wrapping quote', () => {
    const round = parseSkillDoc(serialiseSkillDoc({ name: 'mine', description: '"', extras: [], body: 'B.' }));

    expect(round.ok && round.value.description).toBe('"');
  });

  test('a value wrapped in single quotes round-trips as itself, not as its inside', () => {
    const round = parseSkillDoc(serialiseSkillDoc({ name: 'mine', description: "'quoted'", extras: [], body: 'B.' }));

    expect(round.ok && round.value.description).toBe("'quoted'");
  });

  test('an extra key with a multiline value is folded to one line too', () => {
    const round = parseSkillDoc(serialiseSkillDoc({ name: 'mine', description: 'x.', extras: [{ key: 'note', value: 'one\ntwo' }], body: 'B.' }));

    expect(round.ok && round.value.extras).toEqual([{ key: 'note', value: 'one two' }]);
  });

  test('the body keeps its own newlines, since only frontmatter is folded', () => {
    const round = parseSkillDoc(serialiseSkillDoc({ name: 'mine', description: 'x.', extras: [], body: 'line one\n\nline two' }));

    expect(round.ok && round.value.body).toBe('line one\n\nline two\n');
  });

  test('a doc with no extras writes no extra frontmatter lines', () => {
    const text = serialiseSkillDoc({ name: 'mine', description: 'x.', extras: [], body: 'B.' });

    expect(text).toBe(['---', 'name: mine', 'description: x.', '---', '', 'B.', ''].join('\n'));
  });
});

describe('the frontmatter split, precisely', () => {
  test('a key equal to one this app models is not duplicated into the extras', () => {
    const doc = parseSkillDoc(['---', 'name: mine', 'description: x.', 'name: again', '---', '', 'B.'].join('\n'));

    expect(doc.ok && doc.value.extras).toEqual([]);
  });

  test('a frontmatter line with no colon is not read as a key', () => {
    const doc = parseSkillDoc(['---', 'name: mine', 'description: x.', 'just-a-word', '---', '', 'B.'].join('\n'));

    expect(doc.ok && doc.value.extras).toEqual([]);
  });

  test('the blank line between the fence and the body is not part of the body', () => {
    const doc = parseSkillDoc(['---', 'name: mine', 'description: x.', '---', '', '', 'Body starts here.'].join('\n'));

    expect(doc.ok && doc.value.body.startsWith('Body starts here.')).toBe(true);
  });

  test('a one-character value is never quoted, since there is no pair to strip', () => {
    const round = parseSkillDoc(serialiseSkillDoc({ name: 'x', description: 'y.', extras: [], body: 'B.' }));

    expect(round.ok && round.value.name).toBe('x');
  });

  test('an empty value between two of the same quote is handled without inventing a wrap', () => {
    // "" is length two, both quotes: emitting it bare would round-trip to empty, so it is
    // quoted, and comes back as the two-quote string it was.
    const round = parseSkillDoc(serialiseSkillDoc({ name: 'mine', description: '""', extras: [], body: 'B.' }));

    expect(round.ok && round.value.description).toBe('""');
  });
});

describe('locating the frontmatter exactly', () => {
  test('a byte-order mark before the fence does not throw the body off', () => {
    const doc = parseSkillDoc(['﻿---', 'name: mine', 'description: x.', 'note: kept', '---', '', 'Body.'].join('\n'));

    expect(doc.ok && doc.value.extras).toEqual([{ key: 'note', value: 'kept' }]);
    expect(doc.ok && doc.value.body.trim()).toBe('Body.');
  });

  test('a blank line before the opening fence is skipped, not treated as the start', () => {
    const doc = parseSkillDoc(['', '---', 'name: mine', 'description: x.', 'note: kept', '---', '', 'Body.'].join('\n'));

    expect(doc.ok && doc.value.extras).toEqual([{ key: 'note', value: 'kept' }]);
  });

  test('a frontmatter line with an empty key is not an extra', () => {
    const doc = parseSkillDoc(['---', 'name: mine', 'description: x.', ': orphaned', '---', '', 'B.'].join('\n'));

    expect(doc.ok && doc.value.extras).toEqual([]);
  });

  test('the body never comes back starting with a blank line', () => {
    const doc = parseSkillDoc(['---', 'name: mine', 'description: x.', '---', '', '', '', 'Body.'].join('\n'));

    expect(doc.ok && doc.value.body.startsWith('Body.')).toBe(true);
  });

  test('a skill with no display name comes back without that field, not with an empty one', () => {
    const doc = parseSkillDoc(['---', 'name: mine', 'description: x.', '---', '', 'B.'].join('\n'));

    expect(doc.ok && 'displayName' in doc.value).toBe(false);
  });

  test('the body keeps its leading indentation trimmed but its trailing text intact', () => {
    const text = serialiseSkillDoc({ name: 'mine', description: 'x.', extras: [], body: '   indented start and a trailing word' });

    expect(text).toContain('indented start and a trailing word\n');
    expect(text).not.toContain('   indented start');
  });
});
