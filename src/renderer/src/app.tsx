/*
 * Page shell. Owns wiring, resolves values, hands plain props to the design system.
 *
 * Carries no class string of its own (hard rule 22) and calls no hook inside a
 * component (hard rule 21): styling and structure live in src/components/**.
 */
import type { FC } from 'react';
import { Welcome } from './components/organisms/welcome/index.tsx';
import { formatModelRef } from '../../shared/model-ref.ts';

const DEFAULT_MODEL = formatModelRef({ providerId: 'anthropic', modelId: 'claude-opus-4-8' });

export const App: FC = () => (
  <Welcome
    title="Ask Marcel Studio"
    tagline="Models, skills, and one conversation panel with Microsoft 365 always in reach."
    runtimeLabel={`electron ${studio.version}`}
    modelLabel={DEFAULT_MODEL}
  />
);

App.displayName = 'App';
