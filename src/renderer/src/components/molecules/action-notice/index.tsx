import type { FC } from 'react';

// A one-line notice that may offer one thing to do about it: Undo after a removal, Show both
// beside a duplicate. Props-only (rule 21); the tone is a typed variant, never a className
// (rule 22).
export type ActionNoticeTone = 'neutral' | 'warning' | 'error';

export type ActionNoticeProps = {
  tone: ActionNoticeTone;
  message: string;
  action?: { readonly label: string; readonly onAction: () => void };
};

const tones: Record<ActionNoticeTone, string> = {
  neutral: 'border-border-subtle bg-surface-raised text-ink',
  warning: 'border-warning/60 bg-warning/10 text-ink',
  error: 'border-danger bg-danger-wash text-danger',
};

export const ActionNotice: FC<ActionNoticeProps> = ({ tone, message, action }) => (
  <div role="status" className={`flex items-center gap-x-3 rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>
    <span className="min-w-0 flex-1">{message}</span>
    {action !== undefined && (
      <button
        type="button"
        onClick={action.onAction}
        className="shrink-0 rounded font-medium underline underline-offset-2 transition hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {action.label}
      </button>
    )}
  </div>
);

ActionNotice.displayName = 'ActionNotice';
