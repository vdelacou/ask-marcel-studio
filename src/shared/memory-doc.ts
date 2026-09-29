/*
 * The notes the app keeps for the user: the words their team uses, who is on it, and
 * who they deal with most.
 *
 * Markdown, one entry per line, because the user edits these on Memory, an entry at a time
 * or as text, and the agent reads them as part of its prompt. A format that survives a hand
 * edit matters more here than a tidy one: anything this cannot parse is kept as it was found
 * and written back out unchanged, so an edit is never silently eaten. The one line dropped is
 * a title the app itself once wrote on the top line, which notes no longer carry (see
 * withoutOldTitle).
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
// No asterisk in a plain word: a bold word the bold form could not read (one with an asterisk
// of its own) would otherwise be taken with its asterisks as the word, and written back
// wrapped in two more on every save.
const BOLD_ENTRY = /^[-*+] \*\*([^*]+)\*\*: ?(.*)$/;
const PLAIN_ENTRY = /^[-*+] ([^:*]+): ?(.*)$/;

// How long a term may be, wherever it comes from: what the model proposed, or what the
// user typed over it while answering. Lives here because it is a fact about the notes, and
// two copies of it would drift.
export const TERM_LIMIT = 80;

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

// The titles the app wrote on the top line of the jargon, team and people notes, exactly as
// it wrote them, until notes stopped carrying one.
const OLD_TITLES: ReadonlySet<string> = new Set(['# Words we use', '# My team', '# People I work with']);

// A note no longer carries a title of its own: the screen already names it, and repeating
// it inside cost a heading in the editor and a line in every prompt. Notes written before
// that lose theirs on the way in, so an old file is cleaned by being opened rather than by
// a migration, and nothing has to remember which shape it is looking at. Only one of the
// app's own titles on the top line is one. Any other heading is the user's, typed further
// down or risen to the top once every entry above it was removed, and it stays.
export const withoutOldTitle = (markdown: string): string => {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const top = lines.findIndex((line) => line.trim().length > 0);
  return lines.filter((line, index) => index !== top || !OLD_TITLES.has(line)).join('\n');
};

export const parseMemoryDoc = (markdown: string): MemoryDoc => {
  const read = withoutOldTitle(markdown)
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
