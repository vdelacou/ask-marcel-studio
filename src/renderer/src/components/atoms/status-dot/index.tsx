import type { FC } from 'react';

// A small dot beside a conversation: it is thinking, or it has an answer you have not
// read. The label is not decoration — the dot is the only thing saying so, and a colour
// alone would say nothing to a screen reader.
export type StatusDotProps = {
  kind: 'running' | 'unseen';
};

const styles: Record<StatusDotProps['kind'], string> = {
  running: 'bg-accent animate-pulse',
  unseen: 'bg-info',
};

const labels: Record<StatusDotProps['kind'], string> = {
  running: 'Working',
  unseen: 'New reply',
};

export const StatusDot: FC<StatusDotProps> = ({ kind }) => (
  <span role="status" className="flex shrink-0 items-center">
    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${styles[kind]}`} />
    <span className="sr-only">{labels[kind]}</span>
  </span>
);

StatusDot.displayName = 'StatusDot';
