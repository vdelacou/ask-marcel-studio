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
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSkillMd } from '../../../shared/skill-md.ts';
import { skillFolderName } from '../../../shared/skill-name.ts';
import { skillDir, skillsDir } from '../../../shared/paths.ts';
import { readTextFile } from '../store/json-file.ts';
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
};

export type SkillsService = {
  readonly list: () => Promise<Result<readonly Skill[], SkillsError>>;
  readonly add: (sourceDir: string) => Promise<Result<Skill, SkillsError>>;
  readonly remove: (name: string) => Promise<Result<null, SkillsError>>;
  readonly seedBuiltins: () => Promise<Result<null, SkillsError>>;
};

export const createSkillsService = (deps: SkillsServiceDeps): SkillsService => {
  const readSkill = async (folder: string): Promise<Skill | undefined> => {
    const checked = skillFolderName(folder);
    if (!checked.ok) return undefined;

    const text = await readTextFile(join(skillDir(deps.userData, checked.value), 'SKILL.md'));
    if (!text.ok) return undefined;

    const parsed = parseSkillMd(text.value);
    if (!parsed.ok) return undefined;
    return { folder: checked.value, name: parsed.value.name, description: parsed.value.description, isBuiltIn: deps.builtinNames.includes(checked.value) };
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

    const skills: Skill[] = [];
    for (const entry of entries) {
      const skill = await readSkill(entry);
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

  // Re-seeded on every launch so an app update ships an updated skill, and so a user
  // who deleted the folder by hand gets it back.
  const seedBuiltins = async (): Promise<Result<null, SkillsError>> => {
    for (const name of deps.builtinNames) {
      const checked = skillFolderName(name);
      if (!checked.ok) return err({ kind: 'bad-name', message: checked.error.message });
      try {
        await mkdir(skillsDir(deps.userData), { recursive: true });
        // force: true here, unlike add(): the bundled copy is the source of truth.
        await cp(join(deps.builtinSource, name), skillDir(deps.userData, checked.value), { recursive: true, force: true });
      } catch (e) {
        return err({ kind: 'write-failed', message: `could not seed the built-in skill ${name}: ${formatError(e)}` });
      }
    }
    return ok(null);
  };

  return { list, add, remove, seedBuiltins };
};
