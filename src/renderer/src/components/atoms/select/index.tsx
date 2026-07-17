import type { FC, SelectHTMLAttributes } from 'react';

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  options: readonly SelectOption[];
} & SelectHTMLAttributes<HTMLSelectElement>;

export const Select: FC<SelectProps> = ({ options, ...props }) => (
  <select
    className="rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    {...props}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

Select.displayName = 'Select';
