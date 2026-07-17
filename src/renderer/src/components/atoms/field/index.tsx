import type { FC, ReactNode } from 'react';

export type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
};

// Wraps a control with its label and hint. A real <label for>, not a styled div,
// so clicking the label focuses the control and screen readers announce it.
export const Field: FC<FieldProps> = ({ label, htmlFor, hint, children }) => (
  <div className="flex flex-col gap-y-1">
    <label htmlFor={htmlFor} className="text-xs font-medium text-ink-muted">
      {label}
    </label>
    {children}
    {hint !== undefined && <p className="text-xs text-ink-muted">{hint}</p>}
  </div>
);

Field.displayName = 'Field';
