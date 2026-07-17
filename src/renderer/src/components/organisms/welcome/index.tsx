import type { FC } from 'react';
import { Badge } from '../../atoms/badge/index.tsx';

export type WelcomeProps = {
  title: string;
  tagline: string;
  runtimeLabel: string;
  modelLabel: string;
};

// The M0 walking skeleton's only screen. It proves the whole stack renders:
// tokens from globals.css, an atom composed by an organism, and values that
// travelled from the preload bridge and the pure shared kernel as plain props.
export const Welcome: FC<WelcomeProps> = ({ title, tagline, runtimeLabel, modelLabel }) => (
  <main className="flex h-full flex-col items-center justify-center gap-y-6 bg-surface px-8 font-sans text-ink">
    <section className="flex w-full max-w-xl flex-col gap-y-4 rounded-panel border border-border-subtle bg-surface-raised p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-ink-muted">{tagline}</p>
      <ul className="flex flex-wrap gap-2">
        <li>
          <Badge>{runtimeLabel}</Badge>
        </li>
        <li>
          <Badge tone="accent">{modelLabel}</Badge>
        </li>
      </ul>
    </section>
  </main>
);

Welcome.displayName = 'Welcome';
