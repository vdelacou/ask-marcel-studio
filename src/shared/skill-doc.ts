/*
 * A SKILL.md as the editor sees it: a set of frontmatter fields and a body.
 *
 * The whole-file view over skill-md's frontmatter reader. It keeps the editor from having
 * to know the frontmatter syntax: name, description, any extra keys the app does not
 * model (kept in order so an edit never drops them), and the body.
 *
 * The one constraint is that every frontmatter value survives as ONE physical line,
 * because that is how parseSkillMd and the SDK's own loader read it. A description typed
 * across lines is folded on the way out.
 *
 * Pure: no electron, so `bun test` covers it.
 */
import { FENCE, QUOTES, parseSkillMd, unquote } from './skill-md.ts';
import type { SkillMdError } from './skill-md.ts';
import type { Result } from './result.ts';
import { ok } from './result.ts';

export type SkillDoc = {
  readonly name: string;
  readonly description: string;
  readonly displayName?: string;
  readonly extras: readonly { readonly key: string; readonly value: string }[];
  readonly body: string;
};

const MODELLED_KEYS = new Set(['name', 'description', 'displayName']);

export const foldToSingleLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

// Quote a value only when leaving it bare would round-trip differently: a value that
// begins and ends with the same quote character is what the parser would unquote into
// something shorter. Everything else (a value with a colon, say) is left bare, because the
// parser splits on the FIRST colon after the key.
const needsQuoting = (value: string): boolean => {
  const first = value.slice(0, 1);
  return value.length >= 2 && QUOTES.some((quote) => quote === first) && value.endsWith(first);
};

const emitValue = (value: string): string => {
  const folded = foldToSingleLine(value);
  return needsQuoting(folded) ? `"${folded}"` : folded;
};

// Where the frontmatter sits. parseSkillMd has already proved both fences are present, so
// this is only locating them; the BOM and \r are stripped so the indices line up with the
// normalised text the serialiser produces.
const bounds = (contents: string): { readonly lines: readonly string[]; readonly start: number; readonly end: number } => {
  const lines = contents
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split('\n');
  const start = lines.findIndex((line) => line.trim().length > 0);
  const end = lines.findIndex((line, index) => index > start && line.trim() === FENCE);
  return { lines, start, end };
};

const extrasFrom = (lines: readonly string[], start: number, end: number): { readonly key: string; readonly value: string }[] => {
  const extras: { key: string; value: string }[] = [];
  for (const line of lines.slice(start + 1, end)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    if (key.length === 0 || MODELLED_KEYS.has(key)) continue;
    extras.push({ key, value: unquote(line.slice(colon + 1).trim()) });
  }
  return extras;
};

export const parseSkillDoc = (contents: string): Result<SkillDoc, SkillMdError> => {
  const front = parseSkillMd(contents);
  if (!front.ok) return front;
  const { lines, start, end } = bounds(contents);
  // The blank line the serialiser puts between the closing fence and the body is not part
  // of the body.
  const body = lines
    .slice(end + 1)
    .join('\n')
    .replace(/^\n+/, '');
  return ok({
    name: front.value.name,
    description: front.value.description,
    ...(front.value.displayName === undefined ? {} : { displayName: front.value.displayName }),
    extras: extrasFrom(lines, start, end),
    body,
  });
};

export const serialiseSkillDoc = (doc: SkillDoc): string => {
  const front = [
    `name: ${emitValue(doc.name)}`,
    ...(doc.displayName === undefined || doc.displayName.length === 0 ? [] : [`displayName: ${emitValue(doc.displayName)}`]),
    `description: ${emitValue(doc.description)}`,
    ...doc.extras.map((extra) => `${extra.key}: ${emitValue(extra.value)}`),
  ];
  return `${FENCE}\n${front.join('\n')}\n${FENCE}\n\n${doc.body.trimStart()}\n`;
};
