import type { FC } from 'react';

// One file waiting to be sent with the message.
export type AttachmentChipProps = {
  name: string;
  onRemove: () => void;
};

export const AttachmentChip: FC<AttachmentChipProps> = ({ name, onRemove }) => (
  <span className="inline-flex max-w-[14rem] items-center gap-x-1 rounded-full border border-border-subtle bg-surface-raised px-2 py-0.5 text-xs text-ink">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden="true">
      <path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l8.49-8.49a3.5 3.5 0 1 1 4.95 4.95l-8.49 8.49a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78" />
    </svg>
    <span className="truncate">{name}</span>
    <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="shrink-0 rounded-full px-0.5 text-ink-muted transition hover:text-ink">
      ×
    </button>
  </span>
);

AttachmentChip.displayName = 'AttachmentChip';
