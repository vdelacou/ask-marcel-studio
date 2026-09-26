import type { FC, InputHTMLAttributes } from 'react';

// `mono` for a value typed as code or as a term of art, the way a memory word is set.
export type TextInputProps = { mono?: boolean } & InputHTMLAttributes<HTMLInputElement>;

export const TextInput: FC<TextInputProps> = ({ type = 'text', mono = false, ...props }) => (
  <input
    type={type}
    className={`rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${mono ? 'font-mono' : ''}`}
    {...props}
  />
);

TextInput.displayName = 'TextInput';
