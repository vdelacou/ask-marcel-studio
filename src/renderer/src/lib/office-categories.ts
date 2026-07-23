/*
 * The Microsoft 365 categories, named the way the person switching them off would name
 * them.
 *
 * The CLI's own category names are its internal vocabulary (`drive`, `user`, `meta`).
 * A settings screen offering to switch off "user" tells nobody anything.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import { isCategoryEnabled, ALWAYS_ENABLED_CATEGORY } from '../../../shared/office-policy.ts';
import type { OfficeCategory } from '../../../shared/office-catalog.ts';
import type { OfficePolicy } from '../../../shared/types.ts';

const LABELS: Readonly<Record<string, string>> = {
  mail: 'Email',
  calendar: 'Calendar',
  drive: 'Files (OneDrive)',
  sharepoint: 'SharePoint',
  excel: 'Excel workbooks',
  user: 'People directory',
  chats: 'Teams chats',
  teams: 'Teams',
  tasks: 'Tasks and Planner',
  notes: 'OneNote',
};

// The meta category is not one app, so calling it "Search and basics" told nobody
// anything. For display it splits into groups by what its commands actually do; every
// group still toggles the one meta policy, which stays always-on.
const META_GROUPS: readonly { readonly key: string; readonly label: string; readonly commands: readonly string[] }[] = [
  { key: 'meta:local-files', label: 'Local files', commands: ['convert-local-file-to-markdown', 'extract-local-file-images'] },
  { key: 'meta:search', label: 'Search', commands: ['microsoft-search-query', 'next-page'] },
  { key: 'meta:account', label: 'Account', commands: ['my-quick-context', 'scopes-check'] },
];

export const categoryLabel = (name: string): string => LABELS[name] ?? name;

// Two or three lines in the panel. Larger than it was, because the descriptions wrap
// now instead of being cut to a single line.
const SUMMARY_LIMIT = 180;

// Never mid-word: "convert-local-file-to-markdown i…" reads as a fault in the app.
const clip = (sentence: string): string => {
  if (sentence.length <= SUMMARY_LIMIT) return sentence;
  const cut = sentence.slice(0, SUMMARY_LIMIT - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace === -1 ? cut : cut.slice(0, lastSpace)).trimEnd()}…`;
};

// The CLI's summaries are written for a model and run to paragraphs. The first
// sentence is the part a person reads.
export const summaryFirstSentence = (summary: string): string => {
  // Backticks are markdown, and nothing renders them here: the CLI writes `next-page`
  // for a model that reads markdown, and a person just sees the punctuation.
  const oneLine = summary.replace(/\s+/g, ' ').replaceAll('`', '').trim();
  const stop = oneLine.search(/\.(?:\s|$)/);
  return clip(stop === -1 ? oneLine : oneLine.slice(0, stop + 1));
};

export type CategoryRow = {
  // Stable per display row: the CLI category for most, or 'meta:<group>' for the split.
  readonly key: string;
  // The category the switch actually toggles. Stays 'meta' for every split meta row, so
  // switching one is switching the whole always-on group (which cannot be switched off).
  readonly policyName: string;
  readonly label: string;
  readonly commandCount: number;
  readonly isEnabled: boolean;
  // Everything else leans on the meta group: the ids other commands need, paging, and the
  // check that says why a call failed. Those rows show their commands but have no switch.
  readonly isLocked: boolean;
  readonly commands: readonly { readonly name: string; readonly summary: string }[];
};

type Command = { readonly name: string; readonly summary: string };

const readable = (command: { readonly name: string; readonly summary: string }): Command => ({ name: command.name, summary: summaryFirstSentence(command.summary) });

// The meta category as its display groups. A command the table does not place falls to a
// "Search and basics" catch-all, so a new CLI meta command is never dropped silently.
const metaRows = (category: OfficeCategory): readonly CategoryRow[] => {
  const placed = new Set(META_GROUPS.flatMap((group) => group.commands));
  const grouped = META_GROUPS.map((group) => ({
    key: group.key,
    policyName: category.name,
    label: group.label,
    commands: category.commands.filter((command) => group.commands.includes(command.name)).map(readable),
  }));
  const leftover = category.commands.filter((command) => !placed.has(command.name)).map(readable);
  const rows = leftover.length === 0 ? grouped : [...grouped, { key: 'meta:other', policyName: category.name, label: 'Search and basics', commands: leftover }];
  return rows.filter((row) => row.commands.length > 0).map((row) => ({ ...row, commandCount: row.commands.length, isEnabled: true, isLocked: true }));
};

export const categoryRows = (catalog: readonly OfficeCategory[], policy: OfficePolicy | undefined): readonly CategoryRow[] =>
  catalog.flatMap((category) =>
    category.name === ALWAYS_ENABLED_CATEGORY
      ? metaRows(category)
      : [
          {
            key: category.name,
            policyName: category.name,
            label: categoryLabel(category.name),
            commandCount: category.commands.length,
            isEnabled: isCategoryEnabled(policy, category.name),
            isLocked: false,
            commands: category.commands.map(readable),
          },
        ]
  );
