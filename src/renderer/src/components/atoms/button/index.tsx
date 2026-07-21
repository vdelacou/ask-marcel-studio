import type { ButtonHTMLAttributes, FC, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export type ButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-surface hover:opacity-90',
  secondary: 'bg-surface text-ink border border-border-subtle hover:bg-surface-raised',
  danger: 'bg-transparent text-danger border border-border-subtle hover:bg-danger-wash',
};

const styleFor = (variant: ButtonVariant): string => {
  switch (variant) {
    case 'secondary':
      return variantStyles.secondary;
    case 'danger':
      return variantStyles.danger;
    default:
      return variantStyles.primary;
  }
};

export const Button: FC<ButtonProps> = ({ children, variant = 'primary', type = 'button', ...props }) => (
  <button
    type={type}
    className={`inline-flex items-center justify-center gap-x-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${styleFor(variant)}`}
    {...props}
  >
    {children}
  </button>
);

Button.displayName = 'Button';
