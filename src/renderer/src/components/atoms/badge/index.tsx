import type { FC, ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent';

export type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
};

const toneStyles: Record<BadgeTone, string> = {
  neutral: 'bg-surface-raised text-ink-muted border-border-subtle',
  accent: 'bg-accent text-accent-ink border-transparent',
};

export const Badge: FC<BadgeProps> = ({ children, tone = 'neutral' }) => {
  // Named property access, never toneStyles[tone]: a bracket lookup on a prop is
  // the object-injection shape the standard's switch idiom exists to avoid. With
  // only two tones a switch trips sonarjs/no-small-switch, so this reads better
  // and is equally safe. Promote to the switch idiom when a third tone lands.
  const toneClass = tone === 'accent' ? toneStyles.accent : toneStyles.neutral;

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs ${toneClass}`}>{children}</span>;
};

Badge.displayName = 'Badge';
