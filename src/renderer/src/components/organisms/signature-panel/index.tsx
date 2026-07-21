import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { HtmlPreview } from '../../atoms/html-preview/index.tsx';
import { TextArea } from '../../atoms/text-area/index.tsx';
import { PanelNotice } from '../../molecules/panel-notice/index.tsx';
import type { PanelNoticeTone } from '../../molecules/panel-notice/index.tsx';

// HTML rather than markdown, because it is pasted into an Outlook draft whole and
// Outlook is where it has to look right.
export type SignaturePanelProps = {
  html: string;
  isEditing: boolean;
  isSaving: boolean;
  isRegenerating: boolean;
  canRegenerate: boolean;
  notice?: { tone: PanelNoticeTone; message: string };
  onChangeHtml: (html: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRegenerate: () => void;
};

export const SignaturePanel: FC<SignaturePanelProps> = ({
  html,
  isEditing,
  isSaving,
  isRegenerating,
  canRegenerate,
  notice,
  onChangeHtml,
  onStartEdit,
  onSave,
  onCancel,
  onRegenerate,
}) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-baseline justify-between gap-x-4">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Email signature</h2>
        <p className="text-sm text-ink-muted">Marcel puts this at the bottom of every draft it prepares for you.</p>
      </div>
      {!isEditing && (
        <Button variant="secondary" onClick={onStartEdit}>
          Edit
        </Button>
      )}
    </header>

    {isEditing ? (
      <div className="flex flex-col gap-y-3">
        <TextArea mono value={html} onChange={(event) => onChangeHtml(event.target.value)} aria-label="Signature HTML" />
        <div className="flex items-center justify-end gap-x-2">
          <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-y-3">
        {html.trim().length === 0 ? (
          <p className="rounded-panel border border-dashed border-border-subtle p-8 text-center text-sm text-ink-muted">
            No signature yet. Marcel takes one from your mailbox the first time it can, or you can write your own.
          </p>
        ) : (
          <HtmlPreview html={html} title="Your email signature" />
        )}
        <Button variant="secondary" onClick={onRegenerate} disabled={isRegenerating || !canRegenerate}>
          {isRegenerating ? 'Fetching…' : 'Take it from my mailbox'}
        </Button>
      </div>
    )}

    {notice !== undefined && <PanelNotice tone={notice.tone} message={notice.message} />}
  </section>
);

SignaturePanel.displayName = 'SignaturePanel';
