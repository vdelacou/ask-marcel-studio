import type { FC, ReactNode } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { TextArea } from '../../atoms/text-area/index.tsx';
import { ModeTabs } from '../../molecules/mode-tabs/index.tsx';
import { PanelNotice } from '../../molecules/panel-notice/index.tsx';
import type { PanelNoticeTone } from '../../molecules/panel-notice/index.tsx';

//   view      read it
//   rich      edit it as formatted text (the default for people who do not write markdown)
//   markdown  edit the source, for anyone who would rather
export type EditorMode = 'view' | 'rich' | 'markdown';

export type DocumentEditorProps = {
  mode: EditorMode;
  // The rendered document, built app-side (render/markdown) so this stays prop-pure.
  viewNode: ReactNode;
  // The mounted rich editor. Absent hides that tab, so the panel still works if the
  // editor cannot load.
  richNode?: ReactNode;
  markdownValue: string;
  emptyHint?: string;
  isSaving: boolean;
  isDirty: boolean;
  // False when the document breaks a rule the panel has already explained in `notice`
  // (a note past its limit, say). Refusing here rather than trimming on save is the
  // point: nothing is stored that would not be read back.
  canSave?: boolean;
  notice?: { tone: PanelNoticeTone; message: string };
  onSelectMode: (mode: EditorMode) => void;
  onChangeMarkdown: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

const TAB_LABELS: Record<EditorMode, string> = { view: 'View', rich: 'Edit', markdown: 'Edit markdown' };

const asMode = (id: string): EditorMode => {
  if (id === 'rich') return 'rich';
  if (id === 'markdown') return 'markdown';
  return 'view';
};

export const DocumentEditor: FC<DocumentEditorProps> = ({
  mode,
  viewNode,
  richNode,
  markdownValue,
  emptyHint,
  isSaving,
  isDirty,
  canSave = true,
  notice,
  onSelectMode,
  onChangeMarkdown,
  onSave,
  onCancel,
}) => {
  const tabs = [
    { id: 'view', label: TAB_LABELS.view },
    ...(richNode === undefined ? [] : [{ id: 'rich', label: TAB_LABELS.rich }]),
    { id: 'markdown', label: TAB_LABELS.markdown },
  ];

  return (
    <div className="flex flex-col gap-y-3">
      <ModeTabs tabs={tabs} active={mode} onSelect={(id) => onSelectMode(asMode(id))} />

      {mode === 'view' && (
        <div className="rounded-panel border border-border-subtle p-4">
          {markdownValue.trim().length === 0 && emptyHint !== undefined ? <p className="text-sm text-ink-muted">{emptyHint}</p> : viewNode}
        </div>
      )}
      {mode === 'rich' && <div className="rounded-panel border border-border-subtle p-2">{richNode}</div>}
      {mode === 'markdown' && <TextArea mono value={markdownValue} onChange={(event) => onChangeMarkdown(event.target.value)} aria-label="Markdown" />}

      {mode !== 'view' && (
        <div className="flex items-center justify-end gap-x-2">
          <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaving || !isDirty || !canSave}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}

      {notice !== undefined && <PanelNotice tone={notice.tone} message={notice.message} />}
    </div>
  );
};

DocumentEditor.displayName = 'DocumentEditor';
