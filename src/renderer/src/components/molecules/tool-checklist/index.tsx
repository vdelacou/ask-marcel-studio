import type { FC } from 'react';

export type ToolChoice = { id: string; label: string; checked: boolean };

// Which tools a helper may use. Ticking none means it inherits whatever the main agent
// may use, which the caller says in the hint above this.
export type ToolChecklistProps = {
  tools: readonly ToolChoice[];
  onToggle: (id: string) => void;
};

export const ToolChecklist: FC<ToolChecklistProps> = ({ tools, onToggle }) => (
  <div className="flex flex-wrap gap-2">
    {tools.map((tool) => (
      <label
        key={tool.id}
        className={`flex cursor-pointer items-center gap-x-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
          tool.checked ? 'border-accent bg-surface-raised text-ink' : 'border-border-subtle text-ink-muted hover:text-ink'
        }`}
      >
        <input type="checkbox" checked={tool.checked} onChange={() => onToggle(tool.id)} className="h-3 w-3 accent-accent" />
        {tool.label}
      </label>
    ))}
  </div>
);

ToolChecklist.displayName = 'ToolChecklist';
