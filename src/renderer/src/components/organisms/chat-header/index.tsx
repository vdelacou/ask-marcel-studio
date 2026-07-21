import type { FC } from 'react';

export type ChatModelChoice = { readonly value: string; readonly label: string };

// A slim bar above the thread. It exists only when there is a choice to make: with one
// model set up there is nothing to pick, and the app shell renders nothing at all
// rather than a select with a single option.
export type ChatHeaderProps = {
  value: string;
  options: readonly ChatModelChoice[];
  onChange: (value: string) => void;
};

export const ChatHeader: FC<ChatHeaderProps> = ({ value, options, onChange }) => (
  <header className="flex shrink-0 items-center justify-end border-b border-border-subtle px-6 py-1.5">
    <select
      aria-label="Model for this conversation"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="max-w-[18rem] truncate rounded-md bg-transparent px-1.5 py-1 text-xs text-ink-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </header>
);

ChatHeader.displayName = 'ChatHeader';
