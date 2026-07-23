import type { FC, ReactNode } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { TextArea } from '../../atoms/text-area/index.tsx';
import { PanelNotice } from '../../molecules/panel-notice/index.tsx';
import type { PanelNoticeTone } from '../../molecules/panel-notice/index.tsx';

// Which surface a document is edited on. Not a choice the reader makes: there are no mode
// tabs, because a separate View tab showed the same formatted text the rich editor already
// shows, and offering markdown source beside it asked someone who does not write markdown
// to pick between two things they cannot tell apart. Each panel states its own.
//
//   rich      formatted text, for prose (skills, memory, writing voice)
//   markdown  the source itself, for a document whose exact wording IS the artefact
export type EditorMode = 'rich' | 'markdown';

export type DocumentEditorProps = {
  mode: EditorMode;
  // The mounted rich editor. Absent falls back to the markdown box, so a panel stays
  // editable even if the editor cannot load.
  richNode?: ReactNode;
  markdownValue: string;
  // Shown above an empty document, where a blank editor would otherwise say nothing about
  // what belongs in it or what fills it in on its own.
  emptyHint?: string;
  isSaving: boolean;
  isDirty: boolean;
  // False when the document breaks a rule the panel has already explained in `notice`
  // (a note past its limit, say). Refusing here rather than trimming on save is the
  // point: nothing is stored that would not be read back.
  canSave?: boolean;
  notice?: { tone: PanelNoticeTone; message: string };
  onChangeMarkdown: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export const DocumentEditor: FC<DocumentEditorProps> = ({
  mode,
  richNode,
  markdownValue,
  emptyHint,
  isSaving,
  isDirty,
  canSave = true,
  notice,
  onChangeMarkdown,
  onSave,
  onCancel,
}) => (
  <div className="flex flex-col gap-y-3">
    {markdownValue.trim().length === 0 && emptyHint !== undefined && <p className="text-sm text-ink-muted">{emptyHint}</p>}

    {mode === 'rich' && richNode !== undefined ? (
      <div className="rounded-panel border border-border-subtle p-2">{richNode}</div>
    ) : (
      <TextArea mono value={markdownValue} onChange={(event) => onChangeMarkdown(event.target.value)} aria-label="Markdown" />
    )}

    <div className="flex items-center justify-end gap-x-2">
      <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
        Cancel
      </Button>
      <Button onClick={onSave} disabled={isSaving || !isDirty || !canSave}>
        {isSaving ? 'Saving…' : 'Save'}
      </Button>
    </div>

    {notice !== undefined && <PanelNotice tone={notice.tone} message={notice.message} />}
  </div>
);

DocumentEditor.displayName = 'DocumentEditor';
