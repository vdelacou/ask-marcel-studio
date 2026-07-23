/*
 * The notes the app keeps for the user: the words their team uses, who is on it, and
 * who they deal with most.
 *
 * Markdown, one entry per line, because the user reads and edits these in settings and
 * the agent reads them as part of its prompt. A format that survives a hand edit
 * matters more here than a tidy one: anything this cannot parse is kept exactly as it
 * was found and written back out unchanged, so an edit is never silently eaten.
 *
 *   - **TLA**: three-letter acronym, how finance labels quick wins
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */

export type MemoryEntry = { readonly term: string; readonly detail: string };

// An entry, or a line this could not read and therefore will not touch.
type MemoryLine = { readonly kind: 'entry'; readonly entry: MemoryEntry } | { readonly kind: 'raw'; readonly text: string };

export type MemoryDoc = {
  readonly lines: readonly MemoryLine[];
};

// Bold form is what this writes; the plain form is accepted because someone editing by
// hand will not reach for asterisks.
// Any CommonMark list marker: a hand-edited file bullets with `*` or `+` as readily as
// `-`, and an entry the parser cannot see is a term the elicitation re-suggests forever.
const BOLD_ENTRY = /^[-*+] \*\*([^*]+)\*\*: ?(.*)$/;
const PLAIN_ENTRY = /^[-*+] ([^:]+): ?(.*)$/;

export const normaliseTerm = (term: string): string => term.trim().toLowerCase().replace(/\s+/g, ' ');

const readEntry = (line: string): MemoryEntry | undefined => {
  const matched = BOLD_ENTRY.exec(line) ?? PLAIN_ENTRY.exec(line);
  if (matched === null) return undefined;
  const [, rawTerm = '', rawDetail = ''] = matched;
  const term = rawTerm.trim();
  // An entry with no term is not an entry; one with no meaning yet still is, because
  // the user may be part way through typing it.
  if (term.length === 0) return undefined;
  return { term, detail: rawDetail.trim() };
};

// A note no longer carries a title of its own: the screen already names it, and repeating
// it inside cost a heading in the editor and a line in every prompt. Notes written before
// that lose theirs on the way in, so an old file is cleaned by being opened rather than by
// a migration, and nothing has to remember which shape it is looking at.
export const withoutHeading = (markdown: string): string => {
  const lines = markdown.replace(/\r/g, '').split('\n');
  // No branch for the no-title case: findIndex answers -1 there, and slice(-1 + 1) is
  // slice(0), which is every line. Writing the two cases out separately reads as more
  // careful and is in fact the same function, with a condition no test could tell apart.
  return lines.slice(lines.findIndex((line) => line.startsWith('# ')) + 1).join('\n');
};

export const parseMemoryDoc = (markdown: string): MemoryDoc => {
  const read = withoutHeading(markdown)
    .split('\n')
    .map((line): MemoryLine => {
      const entry = readEntry(line);
      return entry === undefined ? { kind: 'raw', text: line } : { kind: 'entry', entry };
    });
  // Blank lines around the entries are formatting, not content: they come back from
  // the serialiser anyway, and keeping them would grow the file on every save.
  return { lines: read.filter((line) => line.kind === 'entry' || line.text.trim().length > 0) };
};

export const listEntries = (doc: MemoryDoc): readonly MemoryEntry[] => doc.lines.flatMap((line) => (line.kind === 'entry' ? [line.entry] : []));

// An addition for a term already there replaces its detail rather than adding a second
// line: the user confirmed one meaning, not two.
export const mergeMemoryEntries = (doc: MemoryDoc, additions: readonly MemoryEntry[]): MemoryDoc => {
  let lines = doc.lines;
  for (const addition of additions) {
    const key = normaliseTerm(addition.term);
    const at = lines.findIndex((line) => line.kind === 'entry' && normaliseTerm(line.entry.term) === key);
    lines = at === -1 ? [...lines, { kind: 'entry', entry: addition }] : lines.map((line, index) => (index === at ? { kind: 'entry', entry: addition } : line));
  }
  return { ...doc, lines };
};

export const serialiseMemoryDoc = (doc: MemoryDoc): string => {
  const body = doc.lines.map((line) => (line.kind === 'entry' ? `- **${line.entry.term}**: ${line.entry.detail}` : line.text));
  return `${body.join('\n')}\n`;
};
