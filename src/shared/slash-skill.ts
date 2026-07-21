/*
 * Turning `/draft-outlook-email reply to Anna` into an instruction the model cannot
 * misread.
 *
 * Skills are offered to the model by their frontmatter description and it decides
 * whether to load one, which is right when the user has not asked for anything in
 * particular and wrong when they have: typing the skill's name IS the ask, and the
 * turn should not depend on a trigger phrase matching.
 *
 * Unknown slash words pass through untouched. Someone typing `/tmp/report.pdf` or
 * `12/07` is writing a message, not invoking anything, so only a first word that
 * exactly names an installed skill is rewritten.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */

export type SlashSkillInput = {
  readonly text: string;
  // The folders under the agent's skills directory, which are the names the Skill tool
  // knows. Injected per send: a skill added in settings applies from the next message.
  readonly skillFolders: readonly string[];
};

export const rewriteSlashSkill = (input: SlashSkillInput): string => {
  const trimmed = input.text.trimStart();
  if (!trimmed.startsWith('/')) return input.text;

  const firstBreak = trimmed.search(/\s/);
  const token = firstBreak === -1 ? trimmed.slice(1) : trimmed.slice(1, firstBreak);
  // Folder names are already lowercase (skill-name.ts), so this is the whole match.
  const folder = input.skillFolders.find((name) => name === token.toLowerCase());
  if (folder === undefined) return input.text;

  const rest = firstBreak === -1 ? '' : trimmed.slice(firstBreak).trim();
  const instruction = `Use the Skill tool to load the skill "${folder}" now, then follow it exactly for this request.`;
  if (rest.length === 0) return `${instruction}\n\nThe user invoked it with nothing else: follow the skill's own opening step and ask for whatever it still needs.`;
  return `${instruction}\n\nRequest: ${rest}`;
};
