import type { FC, InputHTMLAttributes } from 'react';

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export const TextInput: FC<TextInputProps> = ({ type = 'text', ...props }) => (
  <input
    type={type}
    className="rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    {...props}
  />
);

TextInput.displayName = 'TextInput';
