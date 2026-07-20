import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';

// A discriminated view, resolved by the page shell from the office status Result.
export type OfficeView = { readonly kind: 'loading' } | { readonly kind: 'signed-in'; readonly scopeCount: number } | { readonly kind: 'signed-out' };

export type OfficePanelProps = {
  view: OfficeView;
  isLoggingIn: boolean;
  error?: string;
  onLogin: () => void;
};

const statusLine = (view: OfficeView): string => {
  if (view.kind === 'loading') return 'Checking your Microsoft 365 sign-in…';
  if (view.kind === 'signed-in') return `Signed in · ${String(view.scopeCount)} permissions granted`;
  return 'Not signed in. Sign in to let the agent read your mail, calendar, files and tasks.';
};

const buttonLabel = (view: OfficeView, isLoggingIn: boolean): string => {
  if (isLoggingIn) return 'Signing in…';
  return view.kind === 'signed-in' ? 'Reconnect' : 'Sign in';
};

export const OfficePanel: FC<OfficePanelProps> = ({ view, isLoggingIn, error, onLogin }) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-baseline justify-between gap-x-4">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Microsoft 365</h2>
        <p className={`text-sm ${view.kind === 'signed-in' ? 'text-success' : 'text-ink-muted'}`}>{statusLine(view)}</p>
      </div>
      {view.kind !== 'loading' && (
        <Button variant={view.kind === 'signed-in' ? 'secondary' : 'primary'} onClick={onLogin} disabled={isLoggingIn}>
          {buttonLabel(view, isLoggingIn)}
        </Button>
      )}
    </header>

    {error !== undefined && (
      <p role="alert" className="rounded-md border border-danger bg-danger-wash px-3 py-2 text-xs text-danger">
        {error}
      </p>
    )}
  </section>
);

OfficePanel.displayName = 'OfficePanel';
