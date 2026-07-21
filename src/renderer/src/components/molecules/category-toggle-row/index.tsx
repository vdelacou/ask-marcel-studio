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
}) => {
  const selected = commands.find((command) => command.name === expandedCommand);

  return (
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
      {/* Names only, three abreast: a category of two dozen commands is eight rows
          instead of twenty-four, and the whole set can be taken in at a glance, which is
          the question being asked here. Nothing is truncated; the long names break at
          their own hyphens. The description belongs to the one command you wondered
          about, so it waits below for the click. */}
      {isExpanded && (
        <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 border-t border-border-subtle p-2 lg:grid-cols-3">
          {commands.map((command) => (
            <li key={command.name} className="flex">
              <button
                type="button"
                aria-pressed={command.name === expandedCommand}
                onClick={() => onExpandCommand(command.name)}
                className={`flex w-full items-start gap-x-1.5 rounded-md px-1.5 py-0.5 text-left hover:bg-surface-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                  command.name === expandedCommand ? 'bg-surface-raised' : ''
                }`}
              >
                <Chevron isOpen={command.name === expandedCommand} size="mt-0.5 h-3 w-3" />
                <span className="min-w-0 font-mono text-[11px] leading-snug text-ink">{command.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {isExpanded && selected !== undefined && (
        <div className="flex flex-col gap-y-0.5 border-t border-border-subtle px-3 py-2.5">
          <span className="font-mono text-[11px] text-ink">{selected.name}</span>
          <p className="text-xs leading-relaxed text-ink-muted">{selected.summary}</p>
        </div>
      )}
    </div>
  );
};

CategoryToggleRow.displayName = 'CategoryToggleRow';
