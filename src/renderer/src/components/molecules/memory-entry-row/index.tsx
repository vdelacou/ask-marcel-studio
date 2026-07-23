import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { TextArea } from '../../atoms/text-area/index.tsx';
import { IconButton } from '../../atoms/icon-button/index.tsx';

// One thing the agent remembers. In its resting state the text with a source tag and
// hover actions; editing swaps the text for a compact field.
export type MemoryEntryRowProps = {
  text: string;
  source: string;
  isEditing: boolean;
  draft: string;
  onStartEdit: () => void;
  onChangeDraft: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove: () => void;
};

// The word a person would use for where a memory came from.
const SOURCE_LABEL: Readonly<Record<string, string>> = {
  user: 'you added',
  chat: 'from a chat',
  extracted: 'noticed',
  migrated: 'from your old notes',
};

const PencilIcon: FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
  </svg>
);

const TrashIcon: FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a1 1 0 0 0 0 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a1 1 0 1 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 11 2H9zM7 8a1 1 0 0 1 2 0v6a1 1 0 1 1-2 0V8zm5-1a1 1 0 0 0-1 1v6a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1z"
      clipRule="evenodd"
    />
  </svg>
);

export const MemoryEntryRow: FC<MemoryEntryRowProps> = ({ text, source, isEditing, draft, onStartEdit, onChangeDraft, onSave, onCancel, onRemove }) => {
  if (isEditing) {
    return (
      <li className="flex flex-col gap-y-2 rounded-panel border border-border-subtle bg-surface-raised p-3">
        <TextArea size="compact" value={draft} aria-label="Edit this memory" onChange={(event) => onChangeDraft(event.target.value)} />
        <div className="flex items-center justify-end gap-x-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-x-3 rounded-panel border border-border-subtle p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-y-1">
        <p className="text-sm text-ink">{text}</p>
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">{SOURCE_LABEL[source] ?? source}</span>
      </div>
      <div className="flex shrink-0 items-center gap-x-1">
        <IconButton label="Edit this memory" onClick={onStartEdit} isHidden>
          <PencilIcon />
        </IconButton>
        <IconButton label="Forget this memory" onClick={onRemove} isHidden>
          <TrashIcon />
        </IconButton>
      </div>
    </li>
  );
};

MemoryEntryRow.displayName = 'MemoryEntryRow';
