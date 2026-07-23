/*
 * Turning a friendly name into the id the agent uses.
 *
 * The user types "Weekly Report"; the agent refers to it as `weekly-report`. The rule is
 * the same one the SubAgent name field enforces (^[a-z0-9][a-z0-9-]*$): lowercase, spaces
 * and underscores to dashes, anything else dropped, no leading or trailing dash.
 *
 * Pure: no react, no electron.
 */
const MAX = 64;

// Written as loops rather than /^-+|-+$/, the classic super-linear backtracking shape the
// linter rejects (the same reason account-key trims this way).
const trimDashes = (value: string): string => {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '-') start += 1;
  while (end > start && value[end - 1] === '-') end -= 1;
  return value.slice(start, end);
};

export const slugify = (name: string): string =>
  trimDashes(
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, MAX)
  );
