/*
 * Reads the frontmatter of a SKILL.md.
 *
 * Hand-rolled rather than pulling in a yaml parser (docs/PLAN.md, ~20 lines, no yaml
 * dep). The frontmatter this needs is two flat string keys; a full yaml dependency
 * would be a lot of surface for `name:` and `description:`.
 *
 * Deliberately lenient about EXTRA keys: skills written for other tools carry
 * `license`, `allowed-tools` and the like, and refusing them would make perfectly
 * good skills unloadable. Strict about the two keys we actually need.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

export type SkillFrontmatter = {
  readonly name: string;
  readonly description: string;
  // What a person should see. The folder name is a handle typed after a slash; this is
  // the same skill said in words, and it is optional because a skill written for another
  // tool will not carry one.
  readonly displayName?: string;
};

export type SkillMdError = {
  readonly kind: 'not-a-skill';
  readonly message: string;
};

export const FENCE = '---';

const notASkill = (message: string): Result<never, SkillMdError> => err({ kind: 'not-a-skill', message });

// Values may be quoted. Strip only a MATCHING pair, so a description that merely
// contains a quote keeps it.
export const QUOTES = ['"', "'"] as const;
export const unquote = (value: string): string => {
  if (value.length < 2) return value;
  const first = value.slice(0, 1);
  const isQuote = QUOTES.some((q) => q === first);
  if (isQuote && value.endsWith(first)) return value.slice(1, -1);
  return value;
};

const readValue = (line: string, key: string): string | undefined => {
  if (!line.startsWith(`${key}:`)) return undefined;
  // Everything after the FIRST colon: a description routinely contains more.
  return unquote(line.slice(key.length + 1).trim());
};

export const parseSkillMd = (contents: string): Result<SkillFrontmatter, SkillMdError> => {
  // The BOM is written as \uFEFF, not literally: a literal one is invisible
  // in the source and trips no-irregular-whitespace. \r so windows line endings do
  // not end up inside the values.
  const lines = contents
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split('\n');

  // The opening fence must be the first non-blank line: a --- further down is a
  // horizontal rule in the body, not frontmatter.
  const start = lines.findIndex((line) => line.trim().length > 0);
  if (start === -1 || lines[start]?.trim() !== FENCE) return notASkill('SKILL.md must open with --- frontmatter');

  const end = lines.findIndex((line, index) => index > start && line.trim() === FENCE);
  if (end === -1) return notASkill('SKILL.md frontmatter is never closed');

  let name: string | undefined;
  let description: string | undefined;
  let displayName: string | undefined;
  for (const line of lines.slice(start + 1, end)) {
    name = name ?? readValue(line, 'name');
    description = description ?? readValue(line, 'description');
    displayName = displayName ?? readValue(line, 'displayName');
  }

  if (name === undefined || name.length === 0) return notASkill('SKILL.md needs a name in its frontmatter');
  if (description === undefined || description.length === 0) return notASkill('SKILL.md needs a description in its frontmatter');
  return ok({ name, description, ...(displayName === undefined || displayName.length === 0 ? {} : { displayName }) });
};

// What to call a skill that never said. `answer-from-m365` is a handle, not a name: this
// turns it into something a person reads without thinking about folders.
export const humanizeSkillFolder = (folder: string): string => {
  const words = folder.split('-').filter((word) => word.length > 0);
  const first = words[0] ?? '';
  return [first.slice(0, 1).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ');
};
