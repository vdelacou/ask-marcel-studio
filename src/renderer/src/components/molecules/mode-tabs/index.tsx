import type { FC } from 'react';

export type ModeTab = { id: string; label: string };

// A segmented control. The labels come from the caller, because "Edit" means something
// different in each place this is used.
export type ModeTabsProps = {
  tabs: readonly ModeTab[];
  active: string;
  onSelect: (id: string) => void;
};

export const ModeTabs: FC<ModeTabsProps> = ({ tabs, active, onSelect }) => (
  <div role="tablist" className="inline-flex gap-x-0.5 rounded-md border border-border-subtle p-0.5">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={tab.id === active}
        onClick={() => onSelect(tab.id)}
        className={`rounded px-2.5 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
          tab.id === active ? 'bg-surface-raised font-medium text-ink' : 'text-ink-muted hover:text-ink'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

ModeTabs.displayName = 'ModeTabs';
