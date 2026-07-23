import type { FC } from 'react';

export type MenuItemTone = 'default' | 'danger';

export type MenuItem = {
  readonly id: string;
  readonly label: string;
  readonly tone?: MenuItemTone;
};

// The list of actions inside a Popover. Tab order is the natural one: these menus hold two
// or three items, so roving focus would be ceremony without a reader benefit.
export type MenuProps = {
  items: readonly MenuItem[];
  onPick: (id: string) => void;
};

const toneStyles: Record<MenuItemTone, string> = {
  default: 'text-ink hover:bg-surface-raised',
  danger: 'text-danger hover:bg-danger-wash',
};

export const Menu: FC<MenuProps> = ({ items, onPick }) => (
  <div role="menu">
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        onClick={() => onPick(item.id)}
        className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${toneStyles[item.tone ?? 'default']}`}
      >
        {item.label}
      </button>
    ))}
  </div>
);

Menu.displayName = 'Menu';
