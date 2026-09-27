import type { FC } from 'react';
import { IconButton } from '../../atoms/icon-button/index.tsx';

// One entry of a memory list, as read. Props-only (rule 21): the page decides every label and
// what each click does. The entry itself is the edit button, so a click anywhere on the text
// opens it; the pencil says so for anyone who would not guess. A word sets its term in mono,
// the way it is typed; a person wears their initials and a chip saying which list they are in.
export type MemoryEntryPerson = {
  readonly initials: string;
  readonly tagLabel: string;
  readonly isTagged: boolean;
  // What clicking the chip does, spelled out: "Move to other people".
  readonly moveLabel: string;
};

export type MemoryEntryRowProps = {
  term: string;
  detail: string;
  // Undefined on a word.
  person: MemoryEntryPerson | undefined;
  editLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
};

const PencilIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

const TrashIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
);

export const MemoryEntryRow: FC<MemoryEntryRowProps> = ({ term, detail, person, editLabel, deleteLabel, onEdit, onDelete, onMove }) => (
  <li className="group flex items-start gap-x-3 border-b border-border-subtle px-2 py-2.5 transition hover:bg-surface-raised">
    {person !== undefined && (
      <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
        {person.initials}
      </span>
    )}
    <button
      type="button"
      onClick={onEdit}
      data-memory-row
      className={`flex min-w-0 flex-1 cursor-text gap-x-3 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${person === undefined ? 'items-baseline' : 'flex-col gap-y-0.5'}`}
    >
      <span className={`shrink-0 break-words text-sm font-medium text-ink ${person === undefined ? 'w-28 font-mono text-[13px]' : ''}`}>{term}</span>
      <span className="min-w-0 text-sm leading-relaxed text-ink-muted">{detail}</span>
    </button>
    {person !== undefined && (
      <button
        type="button"
        onClick={onMove}
        aria-label={person.moveLabel}
        title={person.moveLabel}
        className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          person.isTagged ? 'border-transparent bg-accent/15 text-accent' : 'border-border-subtle text-ink-muted hover:text-ink'
        }`}
      >
        {person.tagLabel}
      </button>
    )}
    <span className="flex shrink-0 items-center gap-x-0.5">
      <IconButton label={editLabel} onClick={onEdit} isHidden>
        <PencilIcon />
      </IconButton>
      <IconButton label={deleteLabel} onClick={onDelete} isHidden>
        <TrashIcon />
      </IconButton>
    </span>
  </li>
);

MemoryEntryRow.displayName = 'MemoryEntryRow';
