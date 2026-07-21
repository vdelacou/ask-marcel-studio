import type { FC } from 'react';

export type SuggestItem = { id: string; title: string; subtitle?: string };

// The list that opens when a message starts with "/". Logic-free: which items to show
// and which is highlighted are decided by the page shell (lib/slash-suggest).
export type SuggestPopoverProps = {
  items: readonly SuggestItem[];
  activeIndex: number;
  onPick: (id: string) => void;
  onHover: (index: number) => void;
};

export const SuggestPopover: FC<SuggestPopoverProps> = ({ items, activeIndex, onPick, onHover }) => (
  <ul role="listbox" className="absolute bottom-full left-0 right-0 z-10 mb-2 max-h-64 overflow-y-auto rounded-panel border border-border-subtle bg-surface p-1 shadow-lg">
    {items.map((item, index) => (
      <li key={item.id} role="option" aria-selected={index === activeIndex}>
        <button
          type="button"
          onMouseEnter={() => onHover(index)}
          onClick={() => onPick(item.id)}
          className={`flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left ${index === activeIndex ? 'bg-surface-raised' : ''}`}
        >
          <span className="text-sm text-ink">{item.title}</span>
          {item.subtitle !== undefined && <span className="line-clamp-1 text-xs text-ink-muted">{item.subtitle}</span>}
        </button>
      </li>
    ))}
  </ul>
);

SuggestPopover.displayName = 'SuggestPopover';
