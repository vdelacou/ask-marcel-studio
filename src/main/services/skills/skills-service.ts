/*
 * The skills store: what the agent loads via CLAUDE_CONFIG_DIR.
 *
 * <userData>/claude-config/skills/<folder>/SKILL.md, one folder per skill. That path
 * is what `settingSources: ['user']` reads, and session-env already points the agent
 * at it, so writing a folder here is the whole mechanism — there is no registry to
 * keep in sync.
 *
 * Skills apply on the NEXT message, because each turn spawns a fresh SDK process.
 * That is why there is no hot-reload machinery (docs/PLAN.md, risk R7).
 *
 * The IO shell around skill-md.ts and skill-name.ts: every decision about whether
 * something IS a skill, and what it may be called, lives in those pure modules.
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { humanizeSkillFolder, parseSkillMd } from '../../../shared/skill-md.ts';
import { skillFolderName } from '../../../shared/skill-name.ts';
import type { SkillFolderName } from '../../../shared/skill-name.ts';
import { skillDir, skillsDir } from '../../../shared/paths.ts';
import { EMPTY_SEED_META, hasSeedRecord, isSeededContent, parseSeedMeta, rememberSeed, serialiseSeedMeta } from '../../../shared/seed-meta.ts';
import { readJsonFile, readTextFile, writeTextFileAtomic } from '../store/json-file.ts';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { Skill, SkillsError } from '../../../shared/ipc-contract.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type SkillsServiceDeps = {
  readonly userData: string;
  // Where the bundled skills ship from. A parameter, not a resolved constant, because
  // it differs between `electron-vite dev` and a packaged app.
  readonly builtinSource: string;
  // The names that came with the app. They are re-seeded on launch and cannot be
  // removed from the panel.
  readonly builtinNames: readonly string[];
  // Names of built-ins the app USED to ship and has since renamed or dropped. Their
  // folders are deleted from userData on launch, so a renamed pack does not strand the
  // old skill still loading into every turn. Scoped to this explicit list of former
  // built-in names, so a skill the user added under any OTHER name is never touched (a
  // user skill deliberately named after a former built-in is the one accepted collision).
  readonly retiredBuiltinNames: readonly string[];
};

export type SkillsService = {
  readonly list: () => Promise<Result<readonly Skill[], SkillsError>>;
  readonly add: (sourceDir: string) => Promise<Result<Skill, SkillsError>>;
  readonly remove: (name: string) => Promise<Result<null, SkillsError>>;
  readonly seedBuiltins: () => Promise<Result<null, SkillsError>>;
  // The whole SKILL.md, for the editor.
  readonly read: (folder: string) => Promise<Result<string, SkillsError>>;
  // Refuses anything that would stop being a skill: a file the agent cannot load is
  // worse than an unsaved edit.
  readonly write: (folder: string, contents: string) => Promise<Result<Skill, SkillsError>>;
  // Puts the version that ships with the app back, and lets it follow app updates again.
  readonly restore: (folder: string) => Promise<Result<Skill, SkillsError>>;
};

// The dot means skill-name.ts can never accept it as a folder, so it cannot be listed
// as a skill or reached by any name crossing IPC.
const SEED_META_FILE = '.seed-meta.json';

const sha256 = (contents: string): string => createHash('sha256').update(contents).digest('hex');

export const createSkillsService = (deps: SkillsServiceDeps): SkillsService => {
  const metaPath = join(skillsDir(deps.userData), SEED_META_FILE);

  const readMeta = async (): Promise<ReturnType<typeof parseSeedMeta>> => {
    const raw = await readJsonFile(metaPath);
    return raw.ok ? parseSeedMeta(raw.value) : EMPTY_SEED_META;
  };

  const readSkill = async (folder: string, meta?: ReturnType<typeof parseSeedMeta>): Promise<Skill | undefined> => {
    const checked = skillFolderName(folder);
    if (!checked.ok) return undefined;

    const text = await readTextFile(join(skillDir(deps.userData, checked.value), 'SKILL.md'));
    if (!text.ok) return undefined;

    const parsed = parseSkillMd(text.value);
    if (!parsed.ok) return undefined;
    const isBuiltIn = deps.builtinNames.includes(checked.value);
    const record = meta ?? (await readMeta());
    // Modified means "differs from what the app last wrote here". A built-in nobody
    // has a record for is not modified: it predates the bookkeeping.
    const isModified = isBuiltIn && hasSeedRecord(record, checked.value) && !isSeededContent(record, checked.value, sha256(text.value));
    return {
      folder: checked.value,
      name: parsed.value.name,
      displayName: parsed.value.displayName ?? humanizeSkillFolder(checked.value),
      description: parsed.value.description,
      isBuiltIn,
      isModified,
    };
  };

  const list = async (): Promise<Result<readonly Skill[], SkillsError>> => {
    let entries: string[];
    try {
      entries = await readdir(skillsDir(deps.userData));
    } catch (e) {
      // Before the first seed the folder does not exist, which is an empty list.
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'ENOENT') return ok([]);
      return err({ kind: 'unreadable', message: formatError(e) });
    }

    const meta = await readMeta();
    const skills: Skill[] = [];
    for (const entry of entries) {
      const skill = await readSkill(entry, meta);
      // A folder that is not a skill simply does not list, rather than breaking the
      // panel: the user may have dropped anything in there.
      if (skill !== undefined) skills.push(skill);
    }
    return ok([...skills].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const copyInto = async (sourceDir: string, folder: string): Promise<Result<Skill, SkillsError>> => {
    const checked = skillFolderName(folder);
    if (!checked.ok) return err({ kind: 'bad-name', message: checked.error.message });

    const target = skillDir(deps.userData, checked.value);
    try {
      await mkdir(skillsDir(deps.userData), { recursive: true });
      // force: false makes an existing skill a real error rather than a silent
      // overwrite of something the user still wants.
      await cp(sourceDir, target, { recursive: true, force: false, errorOnExist: true });
    } catch (e) {
      return err({ kind: 'write-failed', message: `could not install the skill: ${formatError(e)}` });
    }

    const installed = await readSkill(checked.value);
    if (installed === undefined) return err({ kind: 'unreadable', message: 'the skill was copied but could not be read back' });
    return ok(installed);
  };

  const add = async (sourceDir: string): Promise<Result<Skill, SkillsError>> => {
    // Validate BEFORE copying: never leave half a folder behind on bad input.
    const text = await readTextFile(join(sourceDir, 'SKILL.md'));
    if (!text.ok) return err({ kind: 'not-a-skill', message: 'that folder has no SKILL.md in it' });

    const parsed = parseSkillMd(text.value);
    if (!parsed.ok) return err({ kind: 'not-a-skill', message: parsed.error.message });

    const folder = skillFolderName(parsed.value.name);
    if (!folder.ok) return err({ kind: 'bad-name', message: folder.error.message });

    const existing = await readSkill(folder.value);
    if (existing !== undefined) return err({ kind: 'already-installed', message: `a skill called ${parsed.value.name} is already installed` });

    return copyInto(sourceDir, folder.value);
  };

  const remove = async (name: string): Promise<Result<null, SkillsError>> => {
    const checked = skillFolderName(name);
    if (!checked.ok) return err({ kind: 'bad-name', message: checked.error.message });
    // The built-ins came with the app and are re-seeded on every launch, so removing
    // one would just reappear. Refuse honestly instead.
    if (deps.builtinNames.includes(checked.value)) return err({ kind: 'built-in', message: `${name} ships with the app and cannot be removed` });

    const existing = await readSkill(checked.value);
    if (existing === undefined) return err({ kind: 'not-found', message: `no skill called ${name}` });

    try {
      await rm(skillDir(deps.userData, checked.value), { recursive: true, force: true });
      return ok(null);
    } catch (e) {
      return err({ kind: 'write-failed', message: `could not remove the skill: ${formatError(e)}` });
    }
  };

  const writeMeta = async (meta: ReturnType<typeof parseSeedMeta>): Promise<void> => {
    // A failed write only means the next launch re-adopts what is on disk, which is the
    // same place this started. Not worth failing a seed over.
    await writeTextFileAtomic(metaPath, serialiseSeedMeta(meta));
  };

  const copyBuiltin = async (
    name: string,
    folder: SkillFolderName,
    bundled: string,
    meta: ReturnType<typeof parseSeedMeta>
  ): Promise<Result<ReturnType<typeof parseSeedMeta>, SkillsError>> => {
    try {
      await mkdir(skillsDir(deps.userData), { recursive: true });
      // force: true here, unlike add(): this is the app's own copy going back.
      await cp(join(deps.builtinSource, name), skillDir(deps.userData, folder), { recursive: true, force: true });
    } catch (e) {
      return err({ kind: 'write-failed', message: `could not seed the built-in skill ${name}: ${formatError(e)}` });
    }
    return ok(rememberSeed(meta, folder, sha256(bundled)));
  };

  /*
   * Seeded on every launch, but no longer blindly.
   *
   * The rule, per folder: absent means write it; present and untouched since the app
   * last wrote it means a new version may replace it; present and changed means the
   * user changed it, so it stays until they ask for the original back.
   *
   * A folder with no record predates this bookkeeping, so it is adopted once (the old
   * behaviour, exactly once more) and protected from then on.
   *
   * Retired names are removed first, so an app update that renamed the pack does not
   * leave the old skill loading forever.
   */
  const seedBuiltins = async (): Promise<Result<null, SkillsError>> => {
    for (const name of deps.retiredBuiltinNames) {
      const checked = skillFolderName(name);
      // An unparseable retired name is not worth failing the whole seed over: it just
      // cannot match a folder on disk, so there is nothing to remove.
      if (!checked.ok) continue;
      try {
        // force: true so an already-absent folder (the common case after the first
        // launch that retired it) is a no-op rather than an error.
        await rm(skillDir(deps.userData, checked.value), { recursive: true, force: true });
      } catch (e) {
        return err({ kind: 'write-failed', message: `could not retire the built-in skill ${name}: ${formatError(e)}` });
      }
    }

    let meta = await readMeta();
    for (const name of deps.builtinNames) {
      const checked = skillFolderName(name);
      if (!checked.ok) return err({ kind: 'bad-name', message: checked.error.message });

      const bundled = await readTextFile(join(deps.builtinSource, name, 'SKILL.md'));
      if (!bundled.ok) return err({ kind: 'write-failed', message: `could not read the bundled skill ${name}: ${bundled.error.message}` });

      const current = await readTextFile(join(skillDir(deps.userData, checked.value), 'SKILL.md'));
      const userEdited = current.ok && hasSeedRecord(meta, checked.value) && !isSeededContent(meta, checked.value, sha256(current.value));
      if (userEdited) continue;

      const seeded = await copyBuiltin(name, checked.value, bundled.value, meta);
      if (!seeded.ok) return seeded;
      meta = seeded.value;
    }
    await writeMeta(meta);
    return ok(null);
  };

  const read = async (folder: string): Promise<Result<string, SkillsError>> => {
    const checked = skillFolderName(folder);
    if (!checked.ok) return err({ kind: 'bad-name', message: checked.error.message });

    const text = await readTextFile(join(skillDir(deps.userData, checked.value), 'SKILL.md'));
    if (!text.ok) return err({ kind: 'not-found', message: `no skill called ${folder}` });
    return ok(text.value);
  };

  const write = async (folder: string, contents: string): Promise<Result<Skill, SkillsError>> => {
    const checked = skillFolderName(folder);
    if (!checked.ok) return err({ kind: 'bad-name', message: checked.error.message });

    const existing = await readTextFile(join(skillDir(deps.userData, checked.value), 'SKILL.md'));
    if (!existing.ok) return err({ kind: 'not-found', message: `no skill called ${folder}` });

    // Checked BEFORE writing: a SKILL.md the agent cannot load is worse than an edit
    // the user has to fix in the editor they are already looking at.
    const parsed = parseSkillMd(contents);
    if (!parsed.ok) return err({ kind: 'invalid', message: parsed.error.message });

    const written = await writeTextFileAtomic(join(skillDir(deps.userData, checked.value), 'SKILL.md'), contents);
    if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });

    const saved = await readSkill(checked.value);
    if (saved === undefined) return err({ kind: 'unreadable', message: 'the skill was saved but could not be read back' });
    return ok(saved);
  };

  const restore = async (folder: string): Promise<Result<Skill, SkillsError>> => {
    const checked = skillFolderName(folder);
    if (!checked.ok) return err({ kind: 'bad-name', message: checked.error.message });
    if (!deps.builtinNames.includes(checked.value)) return err({ kind: 'not-found', message: `${folder} did not come with the app, so there is no original to restore` });

    const bundled = await readTextFile(join(deps.builtinSource, checked.value, 'SKILL.md'));
    if (!bundled.ok) return err({ kind: 'unreadable', message: `could not read the original ${folder}: ${bundled.error.message}` });

    const seeded = await copyBuiltin(checked.value, checked.value, bundled.value, await readMeta());
    if (!seeded.ok) return seeded;
    await writeMeta(seeded.value);

    const restored = await readSkill(checked.value);
    if (restored === undefined) return err({ kind: 'unreadable', message: 'the original was restored but could not be read back' });
    return ok(restored);
  };

  return { list, add, remove, seedBuiltins, read, write, restore };
};
