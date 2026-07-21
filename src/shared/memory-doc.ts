/*
 * The notes the app keeps for the user: the words their team uses, who is on it, and
 * who they deal with most.
 *
 * Markdown, one entry per line, because the user reads and edits these in settings and
 * the agent reads them as part of its prompt. A format that survives a hand edit
 * matters more here than a tidy one: anything this cannot parse is kept exactly as it
 * was found and written back out unchanged, so an edit is never silently eaten.
 *
 *   # Glossary
 *
 *   - **TLA**: three-letter acronym, how finance labels quick wins
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */

export type MemoryEntry = { readonly term: string; readonly detail: string };

// An entry, or a line this could not read and therefore will not touch.
type MemoryLine = { readonly kind: 'entry'; readonly entry: MemoryEntry } | { readonly kind: 'raw'; readonly text: string };

export type MemoryDoc = {
  readonly heading: string;
  readonly lines: readonly MemoryLine[];
};

// Bold form is what this writes; the plain form is accepted because someone editing by
// hand will not reach for asterisks.
const BOLD_ENTRY = /^- \*\*([^*]+)\*\*: ?(.*)$/;
const PLAIN_ENTRY = /^- ([^:]+): ?(.*)$/;

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

export const parseMemoryDoc = (markdown: string, defaultHeading: string): MemoryDoc => {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const headingAt = lines.findIndex((line) => line.startsWith('# '));
  const headingLine = headingAt === -1 ? undefined : lines[headingAt];
  const heading = headingLine === undefined ? defaultHeading : headingLine.slice(2).trim();

  const body = headingAt === -1 ? lines : lines.slice(headingAt + 1);
  const read = body.map((line): MemoryLine => {
    const entry = readEntry(line);
    return entry === undefined ? { kind: 'raw', text: line } : { kind: 'entry', entry };
  });
  // Blank lines around the entries are formatting, not content: they come back from
  // the serialiser anyway, and keeping them would grow the file on every save.
  return { heading, lines: read.filter((line) => line.kind === 'entry' || line.text.trim().length > 0) };
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
  return `# ${doc.heading}\n\n${body.join('\n')}\n`;
};
