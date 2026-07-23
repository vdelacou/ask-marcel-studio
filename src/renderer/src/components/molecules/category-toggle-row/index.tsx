import type { FC } from 'react';
import { Toggle } from '../../atoms/toggle/index.tsx';

export type CategoryCommand = { name: string; summary: string };

// One area of Microsoft 365 the agent can be allowed or refused, with the commands it
// covers readable underneath. The list matters: "switch off Calendar" means nothing until
// you can see what that actually stops. The commands are one per line now, each opening
// its own description in place, rather than a grid of names with the description off to
// the side.
export type CategoryToggleRowProps = {
  label: string;
  commandCount: number;
  isEnabled: boolean;
  isLocked: boolean;
  isExpanded: boolean;
  commands: readonly CategoryCommand[];
  onToggle: () => void;
  onToggleExpand: () => void;
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

export const CategoryToggleRow: FC<CategoryToggleRowProps> = ({ label, commandCount, isEnabled, isLocked, isExpanded, commands, onToggle, onToggleExpand }) => (
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
    {/* One command per line. Each is a native <details>, so its description opens in place
        with no controlled state to thread: a person scanning the list opens the one they
        wondered about and the rest stay quiet. */}
    {isExpanded && (
      <ul className="flex flex-col border-t border-border-subtle p-1">
        {commands.map((command) => (
          <li key={command.name}>
            <details className="group rounded-md px-2 py-1 open:bg-surface-raised">
              <summary className="flex cursor-pointer list-none items-start gap-x-1.5">
                <Chevron isOpen={false} size="mt-0.5 h-3 w-3 group-open:rotate-90" />
                <span className="min-w-0 font-mono text-[11px] leading-snug text-ink">{command.name}</span>
              </summary>
              <p className="mt-1 pl-[1.125rem] text-xs leading-relaxed text-ink-muted">{command.summary}</p>
            </details>
          </li>
        ))}
      </ul>
    )}
  </div>
);

CategoryToggleRow.displayName = 'CategoryToggleRow';
