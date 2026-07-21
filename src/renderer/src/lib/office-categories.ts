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
  // Not one app: search across everything, who the user is, paging through a long
  // answer, reading a file already on the machine, and the sign-in self-check.
  meta: 'Search and basics',
};

export const categoryLabel = (name: string): string => LABELS[name] ?? name;

const SUMMARY_LIMIT = 140;

// The CLI's summaries are written for a model and run to paragraphs. The first
// sentence is the part a person reads.
export const summaryFirstSentence = (summary: string): string => {
  const oneLine = summary.replace(/\s+/g, ' ').trim();
  const stop = oneLine.search(/\.(?:\s|$)/);
  const sentence = stop === -1 ? oneLine : oneLine.slice(0, stop + 1);
  if (sentence.length <= SUMMARY_LIMIT) return sentence;
  return `${sentence.slice(0, SUMMARY_LIMIT - 1).trimEnd()}…`;
};

export type CategoryRow = {
  readonly name: string;
  readonly label: string;
  readonly commandCount: number;
  readonly isEnabled: boolean;
  // Everything else leans on this group: the ids other commands need, paging, and the
  // check that says why a call failed. So that row shows its commands but has no switch.
  readonly isLocked: boolean;
  readonly commands: readonly { readonly name: string; readonly summary: string }[];
};

export const categoryRows = (catalog: readonly OfficeCategory[], policy: OfficePolicy | undefined): readonly CategoryRow[] =>
  catalog.map((category) => ({
    name: category.name,
    label: categoryLabel(category.name),
    commandCount: category.commands.length,
    isEnabled: isCategoryEnabled(policy, category.name),
    isLocked: category.name === ALWAYS_ENABLED_CATEGORY,
    commands: category.commands.map((command) => ({ name: command.name, summary: summaryFirstSentence(command.summary) })),
  }));
