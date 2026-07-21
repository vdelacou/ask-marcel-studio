import type { FC } from 'react';

export type ComposerMenuItem = { id: string; label: string };

// The little menu behind the + button. Anchored to the composer box, which is the
// positioning context, so no portal is needed.
export type ComposerMenuProps = {
  items: readonly ComposerMenuItem[];
  onPick: (id: string) => void;
};

export const ComposerMenu: FC<ComposerMenuProps> = ({ items, onPick }) => (
  <div role="menu" className="absolute bottom-full left-0 z-10 mb-2 min-w-48 rounded-panel border border-border-subtle bg-surface p-1 shadow-lg">
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        onClick={() => onPick(item.id)}
        className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {item.label}
      </button>
    ))}
  </div>
);

ComposerMenu.displayName = 'ComposerMenu';
