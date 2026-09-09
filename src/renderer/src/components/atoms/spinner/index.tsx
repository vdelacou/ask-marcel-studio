import type { FC } from 'react';

// isLabelHidden keeps the label for screen readers and takes it off the screen, for the
// caller that already shows the same words beside the spinner (a working-card row names
// what is running, so printing "Working on it…" again would say it twice).
export type SpinnerProps = { label: string; isLabelHidden?: boolean };

// The label is for screen readers, not decoration: a bare spinning div announces
// nothing. aria-live lets it be picked up when it appears mid-conversation.
export const Spinner: FC<SpinnerProps> = ({ label, isLabelHidden }) => (
  <span role="status" aria-live="polite" className="inline-flex items-center gap-x-2 text-xs text-ink-muted">
    <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
    <span className={isLabelHidden === true ? 'sr-only' : ''}>{label}</span>
  </span>
);

Spinner.displayName = 'Spinner';
