import type { FC, ReactNode } from 'react';

export type IconButtonSize = 'sm' | 'md';

// A square button whose whole label is its icon, so the accessible name has to be spelled
// out. Used for row menus, the sidebar collapse toggle and the conversation header menu.
export type IconButtonProps = {
  label: string;
  onClick: () => void;
  children: ReactNode;
  size?: IconButtonSize;
  isActive?: boolean;
  isHidden?: boolean;
};

const sizeStyles: Record<IconButtonSize, string> = {
  sm: 'h-6 w-6',
  md: 'h-7 w-7',
};

export const IconButton: FC<IconButtonProps> = ({ label, onClick, children, size = 'sm', isActive = false, isHidden = false }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={`inline-flex shrink-0 items-center justify-center rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${sizeStyles[size]} ${
      isActive ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
    } ${isHidden ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100' : ''}`}
  >
    {children}
  </button>
);

IconButton.displayName = 'IconButton';
