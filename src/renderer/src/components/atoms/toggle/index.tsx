import type { FC } from 'react';

// A real switch, not a checkbox styled to look like one: role="switch" is what tells a
// screen reader this is on or off rather than selected or not.
export type ToggleProps = {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: () => void;
};

export const Toggle: FC<ToggleProps> = ({ checked, label, disabled = false, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 ${
      checked ? 'bg-accent' : 'bg-border-subtle'
    }`}
  >
    <span aria-hidden="true" className={`h-4 w-4 rounded-full bg-surface transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

Toggle.displayName = 'Toggle';
