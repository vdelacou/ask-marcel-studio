/*
 * One memory list: the words the user's organisation uses, or the people they work with.
 *
 * Owns what the list is doing right now (the filter, the entry open for writing, the last
 * change that can still be taken back, a note open as text) and hands plain props down
 * (rule 21). What the list shows is worked out in lib/memory-list and said in
 * memory-list-view; what lands on disk is main's call, one entry at a time, through
 * use-memory-notes.
 */
import { useState } from 'react';
import type { FC } from 'react';
import { MemoryListPanel } from '../components/organisms/memory-list-panel/index.tsx';
import { NOTES_OF, approximateTokens, draftProblem, duplicateTerms, rowsOf, unreadLines, visibleRows } from '../lib/memory-list.ts';
import type { MemoryListKind, MemoryListRow, MemoryTeamFilter } from '../lib/memory-list.ts';
import { useMemoryNotes } from '../hooks/use-memory-notes.ts';
import { AS_TEXT, AsText, COPY, editorOf, emptyOf, isTeamFilter, itemOf, noteForNew, noticesOf, segmentsOf, summaryOf, twinsNotice, unreadNotice } from './memory-list-view.tsx';
import type { MemoryListDraft, MemoryListUndo } from './memory-list-view.tsx';
import type { MemoryEditError, MemoryEntryEdit } from '../../../shared/memory-entry-edit.ts';
import type { MemoryFileName } from '../../../shared/memory-file-name.ts';

export type MemoryListSectionProps = {
  list: MemoryListKind;
};

export const MemoryListSection: FC<MemoryListSectionProps> = ({ list }) => {
  const memory = useMemoryNotes();
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState<MemoryTeamFilter>('all');
  const [twinsOnly, setTwinsOnly] = useState(false);
  const [draft, setDraft] = useState<MemoryListDraft | undefined>(undefined);
  const [undo, setUndo] = useState<MemoryListUndo | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [asText, setAsText] = useState<{ readonly note: MemoryFileName; readonly text: string; readonly opened: string } | undefined>(undefined);

  const copy = COPY[list];
  const rows = rowsOf(memory.notes, list);
  const twins = duplicateTerms(rows);
  const isShowingTwins = twinsOnly && twins.length > 0;
  const rowFor = (key: string | undefined): MemoryListRow | undefined => rows.find((row) => row.key === key);

  // Every change goes through here. A refusal because the entry moved on means this view is
  // stale, so the notes are read again before the user tries a second time.
  const run = (change: MemoryEntryEdit, onDone: () => void, onRefused: (error: MemoryEditError) => void): void => {
    setIsSaving(true);
    setFailure(undefined);
    void (async (): Promise<void> => {
      const answered = await memory.edit(change);
      setIsSaving(false);
      if (answered.ok) return onDone();
      if (answered.error.kind === 'not-found') memory.reload();
      onRefused(answered.error);
    })();
  };

  const refuse = (error: MemoryEditError): void => setFailure(error.message);

  const startAdd = (term: string): void => {
    setDraft({ key: undefined, term, detail: '', error: undefined });
    setQuery('');
  };

  const startEdit = (key: string): void => {
    const row = rowFor(key);
    if (row !== undefined) setDraft({ key, term: row.entry.term, detail: row.entry.detail, error: undefined });
  };

  const save = (): void => {
    if (draft === undefined) return;
    const editing = rowFor(draft.key);
    // The row being written went away underneath (removed as a duplicate, say): nothing to save into.
    if (draft.key !== undefined && editing === undefined) return setDraft(undefined);
    const entry = { term: draft.term, detail: draft.detail };
    const problem = draftProblem(rows, entry, editing);
    if (problem !== undefined) return setDraft({ ...draft, error: problem });
    const change: MemoryEntryEdit =
      editing === undefined ? { action: 'add', note: noteForNew(list, team), entry } : { action: 'update', note: editing.note, previous: editing.entry, entry };
    const closed = (): void => {
      setDraft(undefined);
      setUndo(undefined);
    };
    // A refusal lands on the draft as it is now, so words typed while main was answering stay.
    run(change, closed, (error) => setDraft((current) => (current === undefined ? undefined : { ...current, error: error.message })));
  };

  const remove = (key: string): void => {
    const row = rowFor(key);
    if (row === undefined) return;
    const restore: MemoryEntryEdit = { action: 'restore', note: row.note, entry: row.entry, at: row.line };
    run({ action: 'remove', note: row.note, entry: row.entry }, () => setUndo({ message: `Removed ${row.entry.term}.`, change: restore }), refuse);
  };

  const move = (key: string): void => {
    const row = rowFor(key);
    if (row === undefined) return;
    const to: MemoryFileName = row.note === 'team' ? 'people' : 'team';
    const back: MemoryEntryEdit = { action: 'move', note: to, to: row.note, entry: row.entry };
    const where = to === 'team' ? 'your team' : 'other people';
    run({ action: 'move', note: row.note, to, entry: row.entry }, () => setUndo({ message: `Moved ${row.entry.term} to ${where}.`, change: back }), refuse);
  };

  // Once only: a second click while the first is on its way would put the entry back twice.
  const takeBack = (): void => {
    if (undo !== undefined && !isSaving) run(undo.change, () => setUndo(undefined), refuse);
  };

  // The offer to take a change back lapses here: what is typed as text may already have put the
  // entry back, and a restore on top of it would list it twice.
  const openAsText = (id: string): void => {
    const note = NOTES_OF[list].find((name) => name === id);
    if (note === undefined) return;
    setDraft(undefined);
    setFailure(undefined);
    setUndo(undefined);
    setAsText({ note, text: memory.notes[note], opened: memory.notes[note] });
  };

  // A refusal, the note having changed since it was opened, leaves the text on screen so
  // nothing typed is lost.
  const saveText = (note: MemoryFileName, text: string, opened: string): void => {
    setIsSaving(true);
    void (async (): Promise<void> => {
      const saved = await memory.save(note, text, opened);
      setIsSaving(false);
      if (saved.ok) return setAsText(undefined);
      setFailure(saved.error.message);
    })();
  };

  // Nothing until the notes have been read: an empty list for that moment would claim
  // "Nothing yet" about notes that are simply not here yet.
  if (!memory.isLoaded) return null;

  if (asText !== undefined) {
    const { note, text, opened } = asText;
    return (
      <AsText
        note={note}
        text={text}
        opened={opened}
        isSaving={isSaving}
        failure={failure}
        onChange={(next) => setAsText({ note, text: next, opened })}
        onSave={() => saveText(note, text, opened)}
        onClose={() => setAsText(undefined)}
      />
    );
  }

  const editor = draft === undefined ? undefined : editorOf(copy, list, draft, isSaving, { onChange: setDraft, onSave: save, onCancel: () => setDraft(undefined) });

  return (
    <MemoryListPanel
      title={copy.title}
      description={copy.description}
      addLabel={copy.add}
      notices={[
        ...noticesOf(failure, undo, takeBack),
        ...twinsNotice(twins, isShowingTwins, () => setTwinsOnly(!isShowingTwins)),
        ...unreadNotice(unreadLines(memory.notes, list)),
      ]}
      query={query}
      queryLabel={`Filter ${copy.things}`}
      queryPlaceholder={`Filter ${String(rows.length)} ${copy.things}`}
      {...(list === 'people' ? { segments: segmentsOf(rows, team) } : {})}
      items={visibleRows(rows, { query, team, duplicatesOnly: isShowingTwins }).map((row) => itemOf(list, row))}
      {...(editor === undefined ? {} : { editor })}
      empty={emptyOf(copy, query, rows.length > 0, startAdd)}
      summary={summaryOf(rows.length, approximateTokens(memory.notes, list))}
      textModes={NOTES_OF[list].map((note) => ({ id: note, label: AS_TEXT[note].link }))}
      onAdd={() => startAdd('')}
      onQuery={setQuery}
      onSegment={(id) => {
        if (isTeamFilter(id)) setTeam(id);
      }}
      onEdit={startEdit}
      onDelete={remove}
      onMove={move}
      onTextMode={openAsText}
    />
  );
};

MemoryListSection.displayName = 'MemoryListSection';
