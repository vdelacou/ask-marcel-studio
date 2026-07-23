import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';

export type ConfirmTone = 'default' | 'danger';

// A centered question with two answers, for the moments something cannot be undone. Nothing
// is focused when it opens, so a stray Return press cannot confirm a deletion; the page
// shell owns Escape.
export type ConfirmDialogProps = {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: ConfirmTone;
  cancelLabel?: string;
  isBusy?: boolean;
};

export const ConfirmDialog: FC<ConfirmDialogProps> = ({ title, body, confirmLabel, onConfirm, onCancel, tone = 'danger', cancelLabel = 'Cancel', isBusy = false }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-6 [-webkit-app-region:no-drag]">
    <button type="button" aria-label={cancelLabel} onClick={onCancel} className="absolute inset-0 cursor-default" />
    <section
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="relative z-10 flex w-full max-w-sm flex-col gap-y-3 rounded-panel border border-border-subtle bg-surface p-5 shadow-xl"
    >
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="text-sm text-ink-muted">{body}</p>
      <footer className="flex items-center justify-end gap-x-2">
        <Button variant="secondary" onClick={onCancel} disabled={isBusy}>
          {cancelLabel}
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={isBusy}>
          {isBusy ? 'Working…' : confirmLabel}
        </Button>
      </footer>
    </section>
  </div>
);

ConfirmDialog.displayName = 'ConfirmDialog';
