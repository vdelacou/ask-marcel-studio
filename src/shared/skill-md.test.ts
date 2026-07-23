import { describe, expect, test } from 'bun:test';
import { humanizeSkillFolder, parseSkillMd } from './skill-md.ts';

const skill = (body: string): string => body.replace(/^\n/, '');

describe('reading a skill the user just added', () => {
  test('a skill file gives up its name and description', () => {
    const parsed = parseSkillMd(
      skill(`
---
name: pirate-voice
description: Speak like a pirate in every reply.
---

# Pirate voice

Always answer in pirate dialect.
`)
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({ name: 'pirate-voice', description: 'Speak like a pirate in every reply.' });
  });

  test('a real description survives intact, colons, dashes and quotes and all', () => {
    // Verbatim shape from the atelier skills vendored in this repo: one very long
    // line carrying punctuation that a naive split would mangle.
    const description = 'Use when the user wants to stress-test a plan: probe, ping-pong, then execute — never "question spam".';
    const parsed = parseSkillMd(`---\nname: grill-me\ndescription: ${description}\n---\n\n# Grill me\n`);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.description).toBe(description);
  });

  test('the keys may be given in either order', () => {
    const parsed = parseSkillMd('---\ndescription: Does a thing.\nname: thing-doer\n---\n\n# Thing\n');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({ name: 'thing-doer', description: 'Does a thing.' });
  });

  test('values wrapped in quotes come back unquoted', () => {
    const parsed = parseSkillMd('---\nname: "quoted-name"\ndescription: \'single quoted\'\n---\n');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({ name: 'quoted-name', description: 'single quoted' });
  });

  test('extra frontmatter keys are ignored rather than rejected', () => {
    // Skills written for other tools carry keys we have no use for. Refusing them
    // would make perfectly good skills unloadable.
    const parsed = parseSkillMd('---\nname: n\nlicense: MIT\nallowed-tools: Bash\ndescription: d\n---\n');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({ name: 'n', description: 'd' });
  });

  test('a file starting with a blank line or BOM still parses', () => {
    const parsed = parseSkillMd('﻿\n---\nname: n\ndescription: d\n---\n');

    expect(parsed.ok).toBe(true);
  });

  test('windows line endings do not become part of the values', () => {
    const parsed = parseSkillMd('---\r\nname: n\r\ndescription: d\r\n---\r\n');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({ name: 'n', description: 'd' });
  });

  test('a --- inside the body is not mistaken for the end of the frontmatter', () => {
    const parsed = parseSkillMd('---\nname: n\ndescription: d\n---\n\n# Title\n\n---\n\nA horizontal rule above.\n');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.name).toBe('n');
  });
});

describe('refusing a folder that is not a skill', () => {
  // Each asserts its exact message: the message is what the panel shows the user, and
  // it is the only thing distinguishing branches that all return 'not-a-skill'.
  const rejections: ReadonlyArray<{ readonly why: string; readonly body: string; readonly message: string }> = [
    { why: 'a file with no frontmatter at all', body: '# Just a readme\n\nNothing here.\n', message: 'SKILL.md must open with --- frontmatter' },
    { why: 'an empty file', body: '', message: 'SKILL.md must open with --- frontmatter' },
    { why: 'a file of only whitespace', body: '\n\n   \n', message: 'SKILL.md must open with --- frontmatter' },
    { why: 'frontmatter that opens somewhere other than the top', body: '# Title\n\n---\nname: n\ndescription: d\n---\n', message: 'SKILL.md must open with --- frontmatter' },
    { why: 'a file whose frontmatter is never closed', body: '---\nname: n\ndescription: d\n', message: 'SKILL.md frontmatter is never closed' },
    { why: 'frontmatter with no name', body: '---\ndescription: d\n---\n', message: 'SKILL.md needs a name in its frontmatter' },
    { why: 'a blank name', body: '---\nname:\ndescription: d\n---\n', message: 'SKILL.md needs a name in its frontmatter' },
    { why: 'a name of only spaces', body: '---\nname:    \ndescription: d\n---\n', message: 'SKILL.md needs a name in its frontmatter' },
    { why: 'frontmatter with no description', body: '---\nname: n\n---\n', message: 'SKILL.md needs a description in its frontmatter' },
    { why: 'a blank description', body: '---\nname: n\ndescription:\n---\n', message: 'SKILL.md needs a description in its frontmatter' },
    { why: 'a description of only spaces', body: '---\nname: n\ndescription:   \n---\n', message: 'SKILL.md needs a description in its frontmatter' },
  ];

  for (const { why, body, message } of rejections) {
    test(`${why} is not a skill`, () => {
      const parsed = parseSkillMd(body);

      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.error.kind).toBe('not-a-skill');
      expect(parsed.error.message).toBe(message);
    });
  }

  test('an unmatched leading quote is kept rather than half-stripped', () => {
    const parsed = parseSkillMd('---\nname: n\ndescription: "unterminated\n---\n');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.description).toBe('"unterminated');
  });

  test('a one-character value is not mistaken for a quoted pair', () => {
    const parsed = parseSkillMd('---\nname: n\ndescription: "\n---\n');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.description).toBe('"');
  });

  test('a key that merely starts with name is not read as the name', () => {
    // 'nameless:' startsWith('name') would match a naive prefix check.
    const parsed = parseSkillMd('---\nnamespace: wrong\nname: right\ndescription: d\n---\n');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.name).toBe('right');
  });

  test('the reason names what was missing, so the panel can tell the user', () => {
    const parsed = parseSkillMd('---\ndescription: d\n---\n');

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.message).toBe('SKILL.md needs a name in its frontmatter');
  });
});

describe('what a skill is called in front of a person', () => {
  test('a skill may say the name people should see, separate from the one they type', () => {
    const parsed = parseSkillMd('---\nname: answer-from-m365\ndisplayName: Answer from Microsoft 365\ndescription: Reads mail.\n---\nBody');

    expect(parsed.ok && parsed.value.displayName).toBe('Answer from Microsoft 365');
  });

  test('a skill that says nothing has no display name, so the folder speaks for it', () => {
    const parsed = parseSkillMd('---\nname: answer-from-m365\ndescription: Reads mail.\n---\nBody');

    expect(parsed.ok && parsed.value.displayName).toBeUndefined();
  });

  test('an empty display name counts as none, rather than as a blank title', () => {
    const parsed = parseSkillMd('---\nname: mine\ndisplayName:\ndescription: Does a thing.\n---\nBody');

    expect(parsed.ok && parsed.value.displayName).toBeUndefined();
  });

  test('a folder name becomes words, capitalised once, not once per word', () => {
    expect(humanizeSkillFolder('answer-from-m365')).toBe('Answer from m365');
  });

  test('a one word folder is just that word, capitalised', () => {
    expect(humanizeSkillFolder('research')).toBe('Research');
  });

  test('a folder with doubled or trailing dashes does not grow empty words', () => {
    expect(humanizeSkillFolder('draft--outlook-email-')).toBe('Draft outlook email');
  });
});
