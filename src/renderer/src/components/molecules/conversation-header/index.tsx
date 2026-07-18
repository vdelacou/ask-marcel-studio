import type { FC } from 'react';

// Props-only (rule 21): the title and the already-formatted usage line arrive as
// plain strings from the page shell. Usage is hidden until a turn has completed.
export type ConversationHeaderProps = {
  title: string;
  usage: string;
};

export const ConversationHeader: FC<ConversationHeaderProps> = ({ title, usage }) => (
  <header className="flex shrink-0 items-center justify-between gap-x-3 border-b border-border-subtle px-4 py-2">
    <h1 className="truncate text-sm font-medium text-ink">{title}</h1>
    {usage !== '' && <p className="shrink-0 text-xs tabular-nums text-ink-muted">{usage}</p>}
  </header>
);

ConversationHeader.displayName = 'ConversationHeader';
