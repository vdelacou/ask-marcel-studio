import type { FC, KeyboardEvent } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { TextArea } from '../../atoms/text-area/index.tsx';
import { TextInput } from '../../atoms/text-input/index.tsx';

// One entry of a memory list, open for writing: a new one at the top of the list, or an
// existing one in its own place. Props-only (rule 21): the draft, its error and every label
// come from the page. Enter saves and Escape cancels from either field, because an entry is
// one line of its note and a line break has nowhere to go; Shift+Enter is left alone.
export type MemoryEntryEditorProps = {
  term: string;
  detail: string;
  termLabel: string;
  detailLabel: string;
  termPlaceholder: string;
  detailPlaceholder: string;
  // Words are set in mono, the way they are typed; names are not.
  isTermMono: boolean;
  // Which field has the cursor when the editor opens: the word for a new entry, the meaning
  // for an existing one, which is what people come back to change.
  focus: 'term' | 'detail';
  error?: string;
  hint: string;
  saveLabel: string;
  cancelLabel: string;
  isSaving: boolean;
  onChangeTerm: (text: string) => void;
  onChangeDetail: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export const MemoryEntryEditor: FC<MemoryEntryEditorProps> = ({
  term,
  detail,
  termLabel,
  detailLabel,
  termPlaceholder,
  detailPlaceholder,
  isTermMono,
  focus,
  error,
  hint,
  saveLabel,
  cancelLabel,
  isSaving,
  onChangeTerm,
  onChangeDetail,
  onSave,
  onCancel,
}) => {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      // The editor is the innermost thing open, so this Escape is its alone: left to bubble,
      // the app's own Escape would close the whole memory sheet along with it.
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSave();
  };

  return (
    <li className="flex flex-col gap-y-2 border-b border-border-subtle bg-surface-raised px-2 py-3">
      <TextInput
        mono={isTermMono}
        value={term}
        aria-label={termLabel}
        placeholder={termPlaceholder}
        autoFocus={focus === 'term'}
        onChange={(event) => onChangeTerm(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <TextArea
        size="compact"
        value={detail}
        aria-label={detailLabel}
        placeholder={detailPlaceholder}
        autoFocus={focus === 'detail'}
        onChange={(event) => onChangeDetail(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {error !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-x-2">
        <span className="flex-1 text-xs text-ink-faint">{hint}</span>
        <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
          {cancelLabel}
        </Button>
        <Button onClick={onSave} disabled={isSaving}>
          {saveLabel}
        </Button>
      </div>
    </li>
  );
};

MemoryEntryEditor.displayName = 'MemoryEntryEditor';
