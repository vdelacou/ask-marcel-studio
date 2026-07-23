import { describe, expect, test } from 'bun:test';
import { isSkillFormDirty, skillFormFromText, textFromSkillForm } from './skill-form.ts';

const SOURCE = ['---', 'name: my-skill', 'displayName: My Skill', 'description: Does a thing.', 'license: MIT', '---', '', '# The body', '', 'Instructions.', ''].join('\n');

describe('showing a skill as a form', () => {
  test('the fields a person edits are pulled out of the file', () => {
    const form = skillFormFromText(SOURCE);

    expect(form.name).toBe('my-skill');
    expect(form.displayName).toBe('My Skill');
    expect(form.description).toBe('Does a thing.');
    expect(form.body).toContain('# The body');
  });

  test('a frontmatter key this app does not model is kept for the round trip', () => {
    expect(skillFormFromText(SOURCE).extras).toEqual([{ key: 'license', value: 'MIT' }]);
  });

  test('a file that is not a skill opens as an empty form rather than throwing', () => {
    expect(skillFormFromText('not a skill at all')).toEqual({ name: '', displayName: '', description: '', extras: [], body: '' });
  });
});

describe('saving a form back to a file', () => {
  test('editing only the body leaves the frontmatter it did not touch intact', () => {
    const form = skillFormFromText(SOURCE);

    const reparsed = skillFormFromText(textFromSkillForm({ ...form, body: 'A new body.' }));

    expect(reparsed.name).toBe('my-skill');
    expect(reparsed.displayName).toBe('My Skill');
    expect(reparsed.extras).toEqual([{ key: 'license', value: 'MIT' }]);
  });

  test('a description typed across lines is saved as one the file can hold', () => {
    const text = textFromSkillForm({ name: 'mine', displayName: '', description: 'line one\nline two', extras: [], body: 'Body.' });

    expect(skillFormFromText(text).description).toBe('line one line two');
  });

  test('an empty display name is left out of the file, rather than written blank', () => {
    const text = textFromSkillForm({ name: 'mine', displayName: '  ', description: 'x.', extras: [], body: 'Body.' });

    expect(text).not.toContain('displayName:');
  });
});

describe('knowing when a form has really changed', () => {
  test('the same form is not dirty', () => {
    expect(isSkillFormDirty(skillFormFromText(SOURCE), skillFormFromText(SOURCE))).toBe(false);
  });

  test('a description that only gained a trailing space is not a real edit', () => {
    const form = skillFormFromText(SOURCE);

    expect(isSkillFormDirty(form, { ...form, description: 'Does a thing.  ' })).toBe(false);
  });

  test('a real body change is dirty', () => {
    const form = skillFormFromText(SOURCE);

    expect(isSkillFormDirty(form, { ...form, body: 'Different.' })).toBe(true);
  });
});
