import { describe, expect, test } from 'bun:test';
import { skillFolderName } from './skill-name.ts';

describe('naming the folder a skill is copied into', () => {
  test('a normal skill name becomes its own folder', () => {
    const named = skillFolderName('pirate-voice');

    expect(named.ok).toBe(true);
    if (!named.ok) return;
    expect(String(named.value)).toBe('pirate-voice');
  });

  test('a name with capitals and spaces becomes a tidy folder name', () => {
    const named = skillFolderName('Pirate Voice');

    expect(named.ok).toBe(true);
    if (!named.ok) return;
    expect(String(named.value)).toBe('pirate-voice');
  });

  test('underscores and dots survive, since real skill names use them', () => {
    const named = skillFolderName('my_skill.v2');

    expect(named.ok).toBe(true);
    if (!named.ok) return;
    expect(String(named.value)).toBe('my_skill.v2');
  });
});

describe('refusing a skill name that could escape the skills folder', () => {
  // The name comes from a SKILL.md the user picked, i.e. from a file we did not
  // write. It reaches join(<userData>/claude-config/skills, name), so it is a
  // trust boundary exactly like a conversation id.
  const traversals: ReadonlyArray<{ readonly why: string; readonly name: string }> = [
    { why: 'a parent-directory traversal', name: '../../../etc' },
    { why: 'a traversal hidden mid-name', name: 'good/../../evil' },
    { why: 'an absolute path', name: '/etc/passwd' },
    { why: 'a bare path separator', name: 'a/b' },
    { why: 'a name that is only dots', name: '..' },
    { why: 'a single dot', name: '.' },
    { why: 'a name that sanitises away to nothing', name: '///' },
    { why: 'an empty name', name: '' },
    { why: 'only whitespace', name: '   ' },
  ];

  for (const { why, name } of traversals) {
    test(`${why} is rejected`, () => {
      const named = skillFolderName(name);

      expect(named.ok).toBe(false);
      if (named.ok) return;
      expect(named.error.kind).toBe('bad-name');
    });
  }

  test('a rejected name is echoed back so the panel can name it', () => {
    const named = skillFolderName('../evil');

    expect(named.ok).toBe(false);
    if (named.ok) return;
    expect(named.error.name).toBe('../evil');
  });

  test('a name that would collide with a dotfile is rejected', () => {
    // '.hidden' inside the skills dir is not a skill, and a leading dot is how you
    // hide something from the panel that lists it.
    expect(skillFolderName('.hidden').ok).toBe(false);
  });
});
