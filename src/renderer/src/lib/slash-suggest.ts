/*
 * The "/" menu in the composer: which skills to offer while a name is being typed.
 *
 * The list only opens on a slash typed at the very start of an empty message, and
 * closes the moment the name is finished (a space follows), so it never covers the
 * message someone is writing.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */

// `folder` is what a slash invocation matches, and what gets inserted; `displayName` is
// what the list shows. They were the same string once, which is why the list read like a
// directory listing.
export type SkillSuggestion = { readonly folder: string; readonly displayName: string; readonly description: string };

// A slash word being typed at the start of the message, or nothing. The regex is the
// whole rule: no leading text, no whitespace yet.
const SLASH_TOKEN = /^\/([A-Za-z0-9-]*)$/;

export const slashQuery = (draft: string): string | undefined => {
  const matched = SLASH_TOKEN.exec(draft);
  return matched?.[1];
};

export const filterSkills = (skills: readonly SkillSuggestion[], query: string): readonly SkillSuggestion[] => {
  const needle = query.toLowerCase();
  // The folder is what is being typed, so it leads. The words people would use for the
  // same skill come next, then anything whose description mentions it.
  const byFolder = skills.filter((skill) => skill.folder.toLowerCase().startsWith(needle));
  const byName = skills.filter((skill) => !byFolder.includes(skill) && skill.displayName.toLowerCase().startsWith(needle));
  const rest = skills.filter(
    (skill) => !byFolder.includes(skill) && !byName.includes(skill) && `${skill.folder} ${skill.displayName} ${skill.description}`.toLowerCase().includes(needle)
  );
  return [...byFolder, ...byName, ...rest];
};

// Moves the highlight, wrapping at both ends. An empty list has nothing to move to.
export const stepActive = (count: number, current: number, delta: 1 | -1): number => {
  if (count === 0) return 0;
  return (current + delta + count) % count;
};

// The FOLDER, not the display name: it is what a slash invocation is matched against, so
// inserting anything else would type something the agent does not recognise. The trailing
// space matters too: the list closes as soon as the name is complete.
export const insertSkill = (folder: string): string => `/${folder} `;
