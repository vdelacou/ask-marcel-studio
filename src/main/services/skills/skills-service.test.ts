/*
 * The skills service against a real temp userData. This file never imports electron
 * (the folder picker lives in the IPC layer, not here), so the bun runner can run it.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSkillsService } from './skills-service.ts';
import type { SkillsService } from './skills-service.ts';

let userData = '';
let builtinSource = '';
let service: SkillsService;

const writeSkillFolder = (base: string, folder: string, frontmatter: string, body = '# Skill\n'): string => {
  const dir = join(base, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}`);
  return dir;
};

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'studio-skills-'));
  builtinSource = mkdtempSync(join(tmpdir(), 'studio-builtin-'));
  writeSkillFolder(builtinSource, 'ask-marcel-office', 'name: ask-marcel-office\ndescription: Read the user Microsoft 365.');
  service = createSkillsService({ userData, builtinSource, builtinNames: ['ask-marcel-office'], retiredBuiltinNames: [] });
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
  rmSync(builtinSource, { recursive: true, force: true });
});

describe('what the agent can do out of the box', () => {
  test('a fresh install lists nothing rather than failing on a missing folder', async () => {
    const listed = await service.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toEqual([]);
  });

  test('the built-in office skill is seeded on launch and marked as built in', async () => {
    await service.seedBuiltins();

    const listed = await service.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]).toMatchObject({ name: 'ask-marcel-office', isBuiltIn: true });
  });

  test('seeding again overwrites the bundled copy, so an app update ships an updated skill', async () => {
    await service.seedBuiltins();
    writeSkillFolder(builtinSource, 'ask-marcel-office', 'name: ask-marcel-office\ndescription: A newer description.');

    await service.seedBuiltins();

    const listed = await service.list();
    expect(listed.ok && listed.value[0]?.description).toBe('A newer description.');
  });

  test('a built-in the user deleted by hand comes back on the next launch', async () => {
    await service.seedBuiltins();
    rmSync(join(userData, 'claude-config', 'skills', 'ask-marcel-office'), { recursive: true, force: true });

    await service.seedBuiltins();

    const listed = await service.list();
    expect(listed.ok && listed.value).toHaveLength(1);
  });

  test('a renamed pack retires its old folder on launch, so a stale skill stops loading', async () => {
    // The app once shipped `ask-marcel-office`; it now ships two differently named
    // built-ins. Seed the old world, then relaunch as the new one.
    await service.seedBuiltins();
    writeSkillFolder(builtinSource, 'answer-from-m365', 'name: answer-from-m365\ndescription: Answer from M365.');
    const renamed = createSkillsService({ userData, builtinSource, builtinNames: ['answer-from-m365'], retiredBuiltinNames: ['ask-marcel-office'] });

    await renamed.seedBuiltins();

    const listed = await renamed.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((s) => s.name)).toEqual(['answer-from-m365']);
    expect(existsSync(join(userData, 'claude-config', 'skills', 'ask-marcel-office'))).toBe(false);
  });

  test('retirement only touches the named folders, never a skill the user added', async () => {
    const source = writeSkillFolder(tmpdir(), `mine-${String(Date.now())}`, 'name: my-skill\ndescription: Mine.');
    await service.add(source);
    const withRetire = createSkillsService({ userData, builtinSource, builtinNames: [], retiredBuiltinNames: ['ask-marcel-office'] });

    await withRetire.seedBuiltins();

    expect(existsSync(join(userData, 'claude-config', 'skills', 'my-skill'))).toBe(true);
    rmSync(source, { recursive: true, force: true });
  });

  test('retiring a folder that was never installed is a no-op, not an error', async () => {
    const withRetire = createSkillsService({ userData, builtinSource, builtinNames: [], retiredBuiltinNames: ['ask-marcel-office'] });

    const seeded = await withRetire.seedBuiltins();

    expect(seeded.ok).toBe(true);
  });

  test('a built-in cannot be removed, since it would reappear on the next launch anyway', async () => {
    await service.seedBuiltins();

    const removed = await service.remove('ask-marcel-office');

    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error.kind).toBe('built-in');
    expect(existsSync(join(userData, 'claude-config', 'skills', 'ask-marcel-office'))).toBe(true);
  });
});

describe('adding a skill the user picked', () => {
  test('a folder with a SKILL.md is installed under its own name', async () => {
    const source = writeSkillFolder(tmpdir(), `pirate-${String(Date.now())}`, 'name: pirate-voice\ndescription: Speak like a pirate.');

    const added = await service.add(source);

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value).toMatchObject({ name: 'pirate-voice', folder: 'pirate-voice', isBuiltIn: false });
    expect(existsSync(join(userData, 'claude-config', 'skills', 'pirate-voice', 'SKILL.md'))).toBe(true);
    rmSync(source, { recursive: true, force: true });
  });

  test('the whole folder is copied, not just the SKILL.md, since a skill may ship scripts', async () => {
    const source = writeSkillFolder(tmpdir(), `withrefs-${String(Date.now())}`, 'name: withrefs\ndescription: Has references.');
    mkdirSync(join(source, 'references'), { recursive: true });
    writeFileSync(join(source, 'references', 'deep.md'), 'detail');

    await service.add(source);

    expect(existsSync(join(userData, 'claude-config', 'skills', 'withrefs', 'references', 'deep.md'))).toBe(true);
    rmSync(source, { recursive: true, force: true });
  });

  test('an added skill is listed alongside the built-in, and is removable', async () => {
    await service.seedBuiltins();
    const source = writeSkillFolder(tmpdir(), `extra-${String(Date.now())}`, 'name: extra\ndescription: Extra.');
    await service.add(source);

    const listed = await service.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((s) => s.name)).toEqual(['ask-marcel-office', 'extra']);
    expect(listed.value.find((s) => s.name === 'extra')?.isBuiltIn).toBe(false);

    const removed = await service.remove('extra');
    expect(removed.ok).toBe(true);

    const after = await service.list();
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.map((s) => s.name)).toEqual(['ask-marcel-office']);
    rmSync(source, { recursive: true, force: true });
  });

  test('adding the same skill twice is refused rather than overwriting what is there', async () => {
    const source = writeSkillFolder(tmpdir(), `dup-${String(Date.now())}`, 'name: dup\ndescription: First.');
    await service.add(source);

    const again = await service.add(source);

    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.kind).toBe('already-installed');
    rmSync(source, { recursive: true, force: true });
  });

  test('a folder with no SKILL.md is refused, and nothing is copied', async () => {
    const source = mkdtempSync(join(tmpdir(), 'notaskill-'));
    writeFileSync(join(source, 'README.md'), '# not a skill');

    const added = await service.add(source);

    expect(added.ok).toBe(false);
    if (added.ok) return;
    expect(added.error.kind).toBe('not-a-skill');
    expect(existsSync(join(userData, 'claude-config', 'skills'))).toBe(false);
    rmSync(source, { recursive: true, force: true });
  });

  test('a SKILL.md with no frontmatter is refused before anything is copied', async () => {
    const source = mkdtempSync(join(tmpdir(), 'bare-'));
    writeFileSync(join(source, 'SKILL.md'), '# Just a heading\n');

    const added = await service.add(source);

    expect(added.ok).toBe(false);
    if (added.ok) return;
    expect(added.error.kind).toBe('not-a-skill');
    rmSync(source, { recursive: true, force: true });
  });

  test('a skill whose name is a path traversal is refused, and writes nothing at all', async () => {
    // The name comes from a SKILL.md this app did not write, so it is untrusted.
    const source = writeSkillFolder(tmpdir(), `eviltrav-${String(Date.now())}`, 'name: ../../../evil\ndescription: Tries to escape.');
    await service.seedBuiltins();

    const added = await service.add(source);

    expect(added.ok).toBe(false);
    if (added.ok) return;
    expect(added.error.kind).toBe('bad-name');
    // Asserted against THIS run's skills folder, not a shared tmpdir sibling: a
    // sibling path under tmpdir() is shared with every other process on the machine,
    // so a stale folder from anywhere would fail this for the wrong reason.
    const listed = await service.list();
    expect(listed.ok && listed.value.map((s) => s.name)).toEqual(['ask-marcel-office']);
    expect(existsSync(join(userData, 'claude-config', 'skills', 'evil'))).toBe(false);
    rmSync(source, { recursive: true, force: true });
  });
});

describe('listing a skills folder the user has been poking at', () => {
  test('a folder that is not a skill does not break the panel, it simply does not list', async () => {
    await service.seedBuiltins();
    mkdirSync(join(userData, 'claude-config', 'skills', 'junk'), { recursive: true });
    writeFileSync(join(userData, 'claude-config', 'skills', 'junk', 'notes.txt'), 'not a skill');

    const listed = await service.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((s) => s.name)).toEqual(['ask-marcel-office']);
  });

  test('removing a skill that is not installed reports not-found', async () => {
    const removed = await service.remove('ghost');

    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error.kind).toBe('not-found');
  });

  test('removing by a traversal name is refused', async () => {
    const removed = await service.remove('../../../etc');

    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error.kind).toBe('bad-name');
  });
});

describe('editing a skill the app shipped', () => {
  const skillFile = (): string => join(userData, 'claude-config', 'skills', 'ask-marcel-office', 'SKILL.md');
  const edited = 'name: ask-marcel-office\ndescription: My own wording.';
  const asSkillMd = (frontmatter: string): string => `---\n${frontmatter}\n---\n\n# Skill\n`;

  test('the whole file can be read back for the editor', async () => {
    await service.seedBuiltins();

    const read = await service.read('ask-marcel-office');

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value).toContain('description: Read the user Microsoft 365.');
  });

  test('an edit is saved and reported back', async () => {
    await service.seedBuiltins();

    const saved = await service.write('ask-marcel-office', asSkillMd(edited));

    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.description).toBe('My own wording.');
    expect(saved.value.isModified).toBe(true);
  });

  test('an edited built-in survives the next launch, which is the whole point', async () => {
    // It used to be copied over on every start, so editing one was pointless.
    await service.seedBuiltins();
    await service.write('ask-marcel-office', asSkillMd(edited));

    await service.seedBuiltins();

    expect(readFileSync(skillFile(), 'utf8')).toContain('My own wording.');
  });

  test('an untouched built-in still picks up a newer version from an app update', async () => {
    await service.seedBuiltins();
    writeSkillFolder(builtinSource, 'ask-marcel-office', 'name: ask-marcel-office\ndescription: A newer description.');

    await service.seedBuiltins();

    expect(readFileSync(skillFile(), 'utf8')).toContain('A newer description.');
  });

  test('restoring puts the shipped version back', async () => {
    await service.seedBuiltins();
    await service.write('ask-marcel-office', asSkillMd(edited));

    const restored = await service.restore('ask-marcel-office');

    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.description).toBe('Read the user Microsoft 365.');
    expect(restored.value.isModified).toBe(false);
  });

  test('a restored skill follows app updates again', async () => {
    await service.seedBuiltins();
    await service.write('ask-marcel-office', asSkillMd(edited));
    await service.restore('ask-marcel-office');
    writeSkillFolder(builtinSource, 'ask-marcel-office', 'name: ask-marcel-office\ndescription: A newer description.');

    await service.seedBuiltins();

    expect(readFileSync(skillFile(), 'utf8')).toContain('A newer description.');
  });

  test('a built-in deleted by hand comes back on the next launch', async () => {
    await service.seedBuiltins();
    rmSync(join(userData, 'claude-config', 'skills', 'ask-marcel-office'), { recursive: true, force: true });

    await service.seedBuiltins();

    expect(readFileSync(skillFile(), 'utf8')).toContain('Read the user Microsoft 365.');
  });

  test('an edit that would stop it being a skill is refused before it is written', async () => {
    await service.seedBuiltins();

    const saved = await service.write('ask-marcel-office', '# Just a heading, no frontmatter');

    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.error.kind).toBe('invalid');
    expect(readFileSync(skillFile(), 'utf8')).toContain('Read the user Microsoft 365.');
  });

  test('a skill that is not there cannot be read or written', async () => {
    expect((await service.read('nothing-here')).ok).toBe(false);
    expect((await service.write('nothing-here', asSkillMd(edited))).ok).toBe(false);
  });

  test('a name that could reach a path is refused', async () => {
    expect((await service.read('../escape')).ok).toBe(false);
    expect((await service.restore('../escape')).ok).toBe(false);
  });

  test('a skill the user added has no original to restore', async () => {
    const source = writeSkillFolder(tmpdir(), `mine-${String(Date.now())}`, 'name: my-skill\ndescription: Mine.');
    await service.add(source);
    rmSync(source, { recursive: true, force: true });

    const restored = await service.restore('my-skill');

    expect(restored.ok).toBe(false);
    if (restored.ok) return;
    expect(restored.error.kind).toBe('not-found');
  });

  test('a skill the user added is never reported as modified', async () => {
    const source = writeSkillFolder(tmpdir(), `mine2-${String(Date.now())}`, 'name: my-other\ndescription: Mine.');
    await service.add(source);
    rmSync(source, { recursive: true, force: true });

    const listed = await service.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.find((s) => s.folder === 'my-other')?.isModified).toBe(false);
  });

  test('the bookkeeping file is never listed as a skill', async () => {
    await service.seedBuiltins();

    const listed = await service.list();

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((s) => s.folder)).toEqual(['ask-marcel-office']);
  });
});
