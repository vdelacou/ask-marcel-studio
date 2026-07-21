import type { FC, TextareaHTMLAttributes } from 'react';

// A multi-line field. `mono` for anything the user is editing as source (markdown,
// HTML) rather than as prose.
export type TextAreaProps = {
  mono?: boolean;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextArea: FC<TextAreaProps> = ({ mono = false, ...props }) => (
  <textarea
    className={`min-h-48 w-full resize-y rounded-md border border-border-subtle bg-surface px-2.5 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
      mono ? 'font-mono text-xs' : ''
    }`}
    {...props}
  />
);

TextArea.displayName = 'TextArea';
