/*
 * What one memory list says and shows: its words, and the props the list panel is built from.
 *
 * Split from memory-list-section so each stays small: the section owns the state and the
 * clicks, and this turns that state into strings and prop objects (rule 21 keeps both out of
 * the design system). The one component here is the view of a note opened as text.
 */
import type { FC } from 'react';
import type { MemoryListEditor, MemoryListEmpty, MemoryListItem, MemoryListNotice, MemoryListSegments } from '../components/organisms/memory-list-panel/index.tsx';
import type { MemoryEntryPerson } from '../components/molecules/memory-entry-row/index.tsx';
import { NotePanel } from '../components/organisms/note-panel/index.tsx';
import { DocumentEditor } from '../components/organisms/document-editor/index.tsx';
import { initialsOf, visibleRows } from '../lib/memory-list.ts';
import type { MemoryListKind, MemoryListRow, MemoryTeamFilter } from '../lib/memory-list.ts';
import type { MemoryEntryEdit } from '../../../shared/memory-entry-edit.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';

export type MemoryListCopy = {
  readonly title: string;
  readonly description: string;
  readonly add: string;
  readonly things: string;
  readonly termLabel: string;
  readonly detailLabel: string;
  readonly termPlaceholder: string;
  readonly detailPlaceholder: string;
  readonly empty: string;
  // What an empty view says when the list has entries and a filter is hiding them all.
  readonly emptyView: string;
};

export const COPY: Record<MemoryListKind, MemoryListCopy> = {
  words: {
    title: 'Words we use',
    description: 'The words your organisation uses that nobody outside it would know. Marcel reads these before every message.',
    add: 'Add a word',
    things: 'words',
    termLabel: 'Word',
    detailLabel: 'What it means',
    termPlaceholder: 'QW',
    detailPlaceholder: 'Quick win: a saving that lands inside the quarter',
    empty: 'Nothing yet. Marcel adds to this as it comes across words you use, and always asks first.',
    emptyView: 'No word in this view.',
  },
  people: {
    title: 'People I work with',
    description: 'Your team, and the people outside it who come up often. Enough that Marcel knows who is meant when you use a first name.',
    add: 'Add a person',
    things: 'people',
    termLabel: 'Name',
    detailLabel: 'Who they are',
    termPlaceholder: 'Mei Chen',
    detailPlaceholder: 'Finance lead for Greater China; signs off budget changes',
    empty: 'Nothing yet. Marcel adds to this as names come up, and always asks first.',
    emptyView: 'No one in this view.',
  },
};

// Each note's "Edit as text" link, and the heading and example its text view shows.
export const AS_TEXT: Record<MemoryFileName, { readonly link: string; readonly title: string; readonly example: string }> = {
  jargon: { link: 'Edit as text', title: 'Words we use, as text', example: '- **QW**: quick win' },
  team: { link: 'Edit my team as text', title: 'My team, as text', example: '- **Mei Chen**: finance lead' },
  people: { link: 'Edit other people as text', title: 'Other people, as text', example: '- **Mei Chen**: finance lead' },
};

const TEAM_FILTERS: readonly { readonly id: MemoryTeamFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'team', label: 'My team' },
  { id: 'others', label: 'Other people' },
];

export const isTeamFilter = (id: string): id is MemoryTeamFilter => TEAM_FILTERS.some((filter) => filter.id === id);

export type MemoryListDraft = { readonly key: string | undefined; readonly term: string; readonly detail: string; readonly error: string | undefined };

// The last change that can be taken back, and the words that say what it was.
export type MemoryListUndo = { readonly message: string; readonly change: MemoryEntryEdit };

const listed = (names: readonly string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.slice(-1).join('')}`);

export const twinsNotice = (twins: readonly string[], isShowingTwins: boolean, onToggle: () => void): readonly MemoryListNotice[] => {
  if (twins.length === 0) return [];
  if (isShowingTwins) {
    return [
      {
        id: 'twins',
        tone: 'warning',
        message: 'Showing only what is in here twice. Keep the better one of each and delete the other.',
        action: { label: 'Show everything', onAction: onToggle },
      },
    ];
  }
  const one = twins.length === 1;
  return [
    {
      id: 'twins',
      tone: 'warning',
      message: `${listed(twins)} ${one ? 'is' : 'are'} in here twice. Marcel reads both before every message.`,
      action: { label: one ? 'Show both' : 'Show them', onAction: onToggle },
    },
  ];
};

export const unreadNotice = (count: number): readonly MemoryListNotice[] => {
  if (count === 0) return [];
  const [lines, them] = count === 1 ? ['One line here is not an entry', 'it'] : [`${String(count)} lines here are not entries`, 'them'];
  return [{ id: 'unread', tone: 'neutral', message: `${lines}, so the list cannot show ${them}. Marcel still reads ${them}: open the note as text to see ${them}.` }];
};

// How a note that could not be read is named on its list: the words list is that one note.
const UNREADABLE_NAME: Record<MemoryFileName, string> = { jargon: 'This list', team: 'My team', people: 'Other people' };

// A note that could not be read shows as empty, and main refuses any change to it: said first,
// naming it, so the empty list is not taken for an empty note.
export const unreadableNotice = (notes: readonly MemoryFileName[]): readonly MemoryListNotice[] => {
  if (notes.length === 0) return [];
  const [it, they] = notes.length === 1 ? ['it', 'it'] : ['them', 'they'];
  const names = listed(notes.map((note) => UNREADABLE_NAME[note]));
  return [
    {
      id: 'unreadable',
      tone: 'error',
      message: `${names} could not be read from disk, so nothing in ${it} shows here, and nothing can be changed in ${it} until ${they} can be read.`,
    },
  ];
};

export const noticesOf = (failure: string | undefined, undo: MemoryListUndo | undefined, onUndo: () => void): readonly MemoryListNotice[] => [
  ...(failure === undefined ? [] : [{ id: 'failure', tone: 'error' as const, message: failure }]),
  ...(undo === undefined ? [] : [{ id: 'undo', tone: 'neutral' as const, message: undo.message, action: { label: 'Undo', onAction: onUndo } }]),
];

// Lines the list cannot show still ride along, so a list showing none is not an empty note.
export const summaryOf = (count: number, unread: number, tokens: number): string => {
  if (count === 0 && unread > 0) return `Marcel still reads what is here before every message, about ${String(tokens)} tokens.`;
  if (count === 0) return 'Nothing here rides along with your messages yet.';
  const entries = count === 1 ? 'this entry' : `these ${String(count)} entries`;
  return `Marcel reads ${entries} before every message, about ${String(tokens)} tokens.`;
};

// The chip's name starts with the word it shows, so "click My team" finds it by voice too.
const personOf = (row: MemoryListRow): MemoryEntryPerson => ({
  initials: initialsOf(row.entry.term),
  tagLabel: row.isTeam ? 'My team' : 'Other people',
  isTagged: row.isTeam,
  moveLabel: row.isTeam ? `My team: move ${row.entry.term} to Other people` : `Other people: move ${row.entry.term} to My team`,
});

export const itemOf = (list: MemoryListKind, row: MemoryListRow): MemoryListItem => ({
  key: row.key,
  term: row.entry.term,
  detail: row.entry.detail,
  person: list === 'people' ? personOf(row) : undefined,
  editLabel: `Edit ${row.entry.term}`,
  deleteLabel: `Delete ${row.entry.term}`,
});

export const segmentsOf = (rows: readonly MemoryListRow[], team: MemoryTeamFilter): MemoryListSegments => ({
  label: 'Show',
  activeId: team,
  options: TEAM_FILTERS.map((filter) => ({ id: filter.id, label: `${filter.label} ${String(visibleRows(rows, { query: '', team: filter.id, duplicatesOnly: false }).length)}` })),
});

// Why the view is empty, in that order: a search with no match (and the offer to add it), a
// filter hiding every entry there is, something the list cannot show (lines in another shape,
// or a note it could not read), or nothing there at all.
export const emptyOf = (copy: MemoryListCopy, query: string, hasEntries: boolean, hasUnread: boolean, onAdd: (term: string) => void): MemoryListEmpty => {
  const wanted = query.trim();
  if (wanted.length > 0) return { message: `Nothing matches “${wanted}”.`, action: { label: `Add “${wanted}”`, onAction: () => onAdd(wanted) } };
  if (hasEntries) return { message: copy.emptyView };
  return { message: hasUnread ? 'Nothing here the list can show.' : copy.empty };
};

// Where a new person goes: the team, unless the list is showing everyone else.
export const noteForNew = (list: MemoryListKind, team: MemoryTeamFilter): MemoryFileName => {
  if (list === 'words') return 'jargon';
  return team === 'others' ? 'people' : 'team';
};

export type MemoryDraftHandlers = { readonly onChange: (draft: MemoryListDraft) => void; readonly onSave: () => void; readonly onCancel: () => void };

export const editorOf = (copy: MemoryListCopy, list: MemoryListKind, draft: MemoryListDraft, isSaving: boolean, handlers: MemoryDraftHandlers): MemoryListEditor => {
  const isNew = draft.key === undefined;
  return {
    ...(isNew ? {} : { key: draft.key }),
    fields: {
      term: draft.term,
      detail: draft.detail,
      termLabel: copy.termLabel,
      detailLabel: copy.detailLabel,
      termPlaceholder: copy.termPlaceholder,
      detailPlaceholder: copy.detailPlaceholder,
      isTermMono: list === 'words',
      focus: isNew ? 'term' : 'detail',
      ...(draft.error === undefined ? {} : { error: draft.error }),
      hint: 'Enter saves, Esc cancels',
      saveLabel: isNew ? 'Add' : 'Save',
      cancelLabel: 'Cancel',
      isSaving,
      onChangeTerm: (term) => handlers.onChange({ ...draft, term, error: undefined }),
      onChangeDetail: (detail) => handlers.onChange({ ...draft, detail, error: undefined }),
      onSave: handlers.onSave,
      onCancel: handlers.onCancel,
    },
  };
};

// A note opened whole, for pasting many entries at once or reaching a line the list cannot show.
export type AsTextProps = {
  note: MemoryFileName;
  text: string;
  // The note as the view opened it: what the text is measured against, and what the save
  // promises main it is replacing.
  opened: string;
  isSaving: boolean;
  failure: string | undefined;
  onChange: (text: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export const AsText: FC<AsTextProps> = ({ note, text, opened, isSaving, failure, onChange, onSave, onClose }) => (
  <NotePanel
    title={AS_TEXT[note].title}
    description={`One entry per line, written like ${AS_TEXT[note].example}. A line in any other shape is kept as it is, and Marcel still reads it.`}
  >
    <DocumentEditor
      mode="markdown"
      markdownValue={text}
      isSaving={isSaving}
      isDirty={text !== opened}
      {...(failure === undefined ? {} : { notice: { tone: 'error' as const, message: failure } })}
      onChangeMarkdown={onChange}
      onSave={onSave}
      onCancel={onClose}
    />
  </NotePanel>
);

AsText.displayName = 'AsText';
