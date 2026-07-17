/*
 * The folder a skill is copied into, proven safe to interpolate into a path.
 *
 * A trust-boundary checkpoint (hard rule 12), same as conversation-id. The name
 * comes out of a SKILL.md the user picked — a file this app did not write — and
 * reaches join(<userData>/claude-config/skills, name). A name like '../../../etc'
 * would escape the skills folder, and the agent reads whatever lands there.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

// Letters, digits, dash, underscore, dot. Anchored: no separator, no traversal,
// nothing clever can ride along.
const SAFE_FOLDER = /^[a-z0-9][a-z0-9._-]*$/;

export type SkillFolderName = string & { readonly __brand: 'SkillFolderName' };

export type SkillNameError = {
  readonly kind: 'bad-name';
  readonly name: string;
  readonly message: string;
};

export const skillFolderName = (name: string): Result<SkillFolderName, SkillNameError> => {
  // Tidy first: real skill names are already kebab-case, but a hand-written one may
  // carry capitals or spaces, and rejecting those would be unhelpful.
  const tidied = name.trim().toLowerCase().replace(/\s+/g, '-');

  // Checked AFTER tidying, so no input can sanitise its way into something unsafe.
  // The leading-[a-z0-9] anchor is what rejects '.', '..' and '.hidden' — a dotfile
  // is not a skill and would hide from the panel that lists it.
  if (!SAFE_FOLDER.test(tidied)) {
    return err({ kind: 'bad-name', name, message: `a skill name may only contain letters, digits, dash, underscore and dot: ${name}` });
  }
  return ok(tidied as SkillFolderName);
};
