import type { FC } from 'react';

// Props-only (rule 21). A grouped left menu for the settings sections. The page shell
// supplies the groups, labels and which icon each row wears; this component owns the
// icon shapes and the active-row styling.
export type SettingsNavIcon = 'providers' | 'skills' | 'office';
export type SettingsNavItem = { id: string; label: string; icon: SettingsNavIcon };
export type SettingsNavGroup = { heading: string; items: readonly SettingsNavItem[] };

export type SettingsNavProps = {
  groups: readonly SettingsNavGroup[];
  activeId: string;
  onSelect: (id: string) => void;
};

const SparklesIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
    <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684zM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551z" />
  </svg>
);

const BoltIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
    <path d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143z" />
  </svg>
);

const GridIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
    <path d="M6 3a3 3 0 0 0-3 3v2.25a3 3 0 0 0 3 3h2.25a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6zM15.75 3a3 3 0 0 0-3 3v2.25a3 3 0 0 0 3 3H18a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3h-2.25zM6 12.75a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h2.25a3 3 0 0 0 3-3v-2.25a3 3 0 0 0-3-3H6zM15.75 12.75a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3H18a3 3 0 0 0 3-3v-2.25a3 3 0 0 0-3-3h-2.25z" />
  </svg>
);

const icons: Record<SettingsNavIcon, FC> = { providers: SparklesIcon, skills: BoltIcon, office: GridIcon };

export const SettingsNav: FC<SettingsNavProps> = ({ groups, activeId, onSelect }) => (
  <nav className="flex flex-col gap-y-6">
    {groups.map((group) => (
      <div key={group.heading} className="flex flex-col gap-y-1">
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{group.heading}</p>
        {group.items.map((item) => {
          const Icon = icons[item.icon];
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelect(item.id)}
              className={`flex items-center gap-x-2.5 rounded-md px-3 py-1.5 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                isActive ? 'bg-surface-raised font-medium text-ink' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
              }`}
            >
              <Icon />
              {item.label}
            </button>
          );
        })}
      </div>
    ))}
  </nav>
);

SettingsNav.displayName = 'SettingsNav';
