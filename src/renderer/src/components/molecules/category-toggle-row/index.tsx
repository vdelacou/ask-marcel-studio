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
  onToggle: () => void;
  onToggleExpand: () => void;
};

const countLabel = (count: number): string => (count === 1 ? '1 command' : `${String(count)} commands`);

export const CategoryToggleRow: FC<CategoryToggleRowProps> = ({ label, commandCount, isEnabled, isLocked, isExpanded, commands, onToggle, onToggleExpand }) => (
  <div className="flex flex-col rounded-panel border border-border-subtle">
    <div className="flex items-center gap-x-3 px-3 py-2">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggleExpand}
        className="flex min-w-0 flex-1 items-center gap-x-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        >
          <path d="m9 5 7 7-7 7" />
        </svg>
        <span className="truncate text-sm text-ink">{label}</span>
        <span className="shrink-0 text-xs text-ink-muted">{countLabel(commandCount)}</span>
      </button>
      {isLocked ? <span className="shrink-0 text-xs text-ink-muted">Always on</span> : <Toggle checked={isEnabled} label={`Allow ${label}`} onChange={onToggle} />}
    </div>
    {isExpanded && (
      <ul className="flex flex-col gap-y-1 border-t border-border-subtle px-3 py-2">
        {commands.map((command) => (
          <li key={command.name} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[11px] text-ink">{command.name}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{command.summary}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

CategoryToggleRow.displayName = 'CategoryToggleRow';
