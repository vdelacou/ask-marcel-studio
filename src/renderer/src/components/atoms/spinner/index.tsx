import type { FC } from 'react';

export type SpinnerProps = { label: string };

// The label is for screen readers, not decoration: a bare spinning div announces
// nothing. aria-live lets it be picked up when it appears mid-conversation.
export const Spinner: FC<SpinnerProps> = ({ label }) => (
  <span role="status" aria-live="polite" className="inline-flex items-center gap-x-2 text-xs text-ink-muted">
    <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
    {label}
  </span>
);

Spinner.displayName = 'Spinner';
