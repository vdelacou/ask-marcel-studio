/*
 * The "/" menu in the composer: which skills to offer while a name is being typed.
 *
 * The list only opens on a slash typed at the very start of an empty message, and
 * closes the moment the name is finished (a space follows), so it never covers the
 * message someone is writing.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */

export type SkillSuggestion = { readonly name: string; readonly description: string };

// A slash word being typed at the start of the message, or nothing. The regex is the
// whole rule: no leading text, no whitespace yet.
const SLASH_TOKEN = /^\/([A-Za-z0-9-]*)$/;

export const slashQuery = (draft: string): string | undefined => {
  const matched = SLASH_TOKEN.exec(draft);
  return matched?.[1];
};

export const filterSkills = (skills: readonly SkillSuggestion[], query: string): readonly SkillSuggestion[] => {
  const needle = query.toLowerCase();
  const byName = skills.filter((skill) => skill.name.toLowerCase().startsWith(needle));
  // Someone who half-remembers a skill searches by what it does, so the description is
  // matched too. Name matches still come first: that is what was being typed.
  const byText = skills.filter((skill) => !byName.includes(skill) && `${skill.name} ${skill.description}`.toLowerCase().includes(needle));
  return [...byName, ...byText];
};

// Moves the highlight, wrapping at both ends. An empty list has nothing to move to.
export const stepActive = (count: number, current: number, delta: 1 | -1): number => {
  if (count === 0) return 0;
  return (current + delta + count) % count;
};

// The trailing space matters: the list closes as soon as the name is complete, so
// picking one leaves the composer ready for the rest of the message.
export const insertSkill = (name: string): string => `/${name} `;
