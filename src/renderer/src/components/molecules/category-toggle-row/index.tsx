import type { FC } from 'react';
import { Toggle } from '../../atoms/toggle/index.tsx';

export type CategoryCommand = { name: string; summary: string };

// One area of Microsoft 365 the agent can be allowed or refused, with the commands it
// covers readable underneath. The list matters: "switch off Calendar" means nothing
// until you can see what that actually stops.
export type CategoryToggleRowProps = {
  label: string;
  commandCount: number;
  isEnabled: boolean;
  isLocked: boolean;
  isExpanded: boolean;
  commands: readonly CategoryCommand[];
  // The one command whose description is showing, if any. Names alone keep a
  // twenty-four command category to one screenful; the description is a click away.
  expandedCommand?: string;
  onToggle: () => void;
  onToggleExpand: () => void;
  onExpandCommand: (name: string) => void;
};

const countLabel = (count: number): string => (count === 1 ? '1 command' : `${String(count)} commands`);

const Chevron: FC<{ isOpen: boolean; size: string }> = ({ isOpen, size }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={`${size} shrink-0 text-ink-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}
  >
    <path d="m9 5 7 7-7 7" />
  </svg>
);

Chevron.displayName = 'Chevron';

export const CategoryToggleRow: FC<CategoryToggleRowProps> = ({
  label,
  commandCount,
  isEnabled,
  isLocked,
  isExpanded,
  commands,
  expandedCommand,
  onToggle,
  onToggleExpand,
  onExpandCommand,
}) => (
  <div className="flex flex-col rounded-panel border border-border-subtle">
    <div className="flex items-center gap-x-3 px-3 py-2">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggleExpand}
        className="flex min-w-0 flex-1 items-center gap-x-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Chevron isOpen={isExpanded} size="h-3.5 w-3.5" />
        <span className="truncate text-sm text-ink">{label}</span>
        <span className="shrink-0 text-xs text-ink-muted">{countLabel(commandCount)}</span>
      </button>
      {isLocked ? <span className="shrink-0 text-xs text-ink-muted">Always on</span> : <Toggle checked={isEnabled} label={`Allow ${label}`} onChange={onToggle} />}
    </div>
    {/* Names only. A category runs to three dozen commands, and a description beside
        every one of them is a wall nobody reads; the description belongs to the command
        you actually wondered about, so it waits for the click. */}
    {isExpanded && (
      <ul className="flex flex-col border-t border-border-subtle py-1">
        {commands.map((command) => (
          <li key={command.name} className="flex flex-col">
            <button
              type="button"
              aria-expanded={command.name === expandedCommand}
              onClick={() => onExpandCommand(command.name)}
              className="flex items-center gap-x-2 px-3 py-1 text-left hover:bg-surface-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <Chevron isOpen={command.name === expandedCommand} size="h-3 w-3" />
              <span className="font-mono text-[11px] text-ink">{command.name}</span>
            </button>
            {command.name === expandedCommand && <p className="px-3 pb-2 pl-8 text-xs leading-relaxed text-ink-muted">{command.summary}</p>}
          </li>
        ))}
      </ul>
    )}
  </div>
);

CategoryToggleRow.displayName = 'CategoryToggleRow';
