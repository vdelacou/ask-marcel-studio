import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { CategoryToggleRow } from '../../molecules/category-toggle-row/index.tsx';

// One area of Microsoft 365, ready to be switched on or off. Built by the page shell
// (lib/office-categories) from the CLI's own catalog.
export type OfficeCategoryRow = {
  readonly name: string;
  readonly label: string;
  readonly commandCount: number;
  readonly isEnabled: boolean;
  readonly isLocked: boolean;
  readonly commands: readonly { readonly name: string; readonly summary: string }[];
};

// One granted permission, already said in words by the page shell (lib/office-scopes).
export type OfficeScopeRow = { readonly scope: string; readonly label: string };

// A discriminated view, resolved by the page shell from the office status Result. A
// signed-in user can still be missing a token tier, which costs named abilities without
// costing the sign-in: `unavailable` is what stopped working, empty when all is well.
export type OfficeView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'signed-in'; readonly summary: string; readonly scopes: readonly OfficeScopeRow[]; readonly unavailable: readonly string[] }
  | { readonly kind: 'signed-out' };

export type OfficePanelProps = {
  view: OfficeView;
  isLoggingIn: boolean;
  isSigningOut: boolean;
  error?: string;
  isScopesOpen: boolean;
  categories: readonly OfficeCategoryRow[];
  expandedCategory?: string;
  expandedCommand?: string;
  onToggleScopes: () => void;
  onToggleCategory: (name: string) => void;
  onExpandCategory: (name: string) => void;
  onExpandCommand: (name: string) => void;
  onLogin: () => void;
  onSignOut: () => void;
};

const statusLine = (view: OfficeView): string => {
  if (view.kind === 'loading') return 'Checking your Microsoft 365 sign-in…';
  if (view.kind === 'signed-in') return view.summary;
  return 'Not signed in. Sign in to let Marcel read your mail, calendar, files and tasks.';
};

const buttonLabel = (view: OfficeView, isLoggingIn: boolean): string => {
  if (isLoggingIn) return 'Signing in…';
  return view.kind === 'signed-in' ? 'Refresh sign-in' : 'Sign in';
};

const statusTone = (view: OfficeView): string => {
  if (view.kind !== 'signed-in') return 'text-ink-muted';
  return view.unavailable.length > 0 ? 'text-warning' : 'text-success';
};

export const OfficePanel: FC<OfficePanelProps> = ({
  view,
  isLoggingIn,
  isSigningOut,
  error,
  isScopesOpen,
  categories,
  expandedCategory,
  expandedCommand,
  onToggleScopes,
  onToggleCategory,
  onExpandCategory,
  onExpandCommand,
  onLogin,
  onSignOut,
}) => (
  <section className="flex flex-col gap-y-4">
    <header className="flex items-baseline justify-between gap-x-4">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Microsoft 365</h2>
        <p className={`text-sm ${statusTone(view)}`}>{statusLine(view)}</p>
      </div>
      {view.kind !== 'loading' && (
        <div className="flex shrink-0 items-center gap-x-2">
          <Button variant={view.kind === 'signed-in' ? 'secondary' : 'primary'} onClick={onLogin} disabled={isLoggingIn || isSigningOut}>
            {buttonLabel(view, isLoggingIn)}
          </Button>
          {view.kind === 'signed-in' && (
            <Button variant="secondary" onClick={onSignOut} disabled={isLoggingIn || isSigningOut}>
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </Button>
          )}
        </div>
      )}
    </header>

    {view.kind === 'signed-in' && view.unavailable.length > 0 && (
      <div className="flex flex-col gap-y-1 rounded-panel border border-border-subtle bg-surface-raised p-3">
        <p className="text-sm text-ink">Part of your sign-in has expired. Until you refresh it, Marcel cannot:</p>
        <ul className="flex list-disc flex-col gap-y-0.5 pl-5 text-sm text-ink-muted">
          {view.unavailable.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </div>
    )}

    {view.kind === 'signed-in' && (
      <div className="flex flex-col gap-y-2">
        <button
          type="button"
          aria-expanded={isScopesOpen}
          onClick={onToggleScopes}
          className="self-start rounded-md text-sm text-ink-muted underline-offset-4 transition hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {isScopesOpen ? 'Hide the details' : 'What exactly can it access?'}
        </button>
        {isScopesOpen && (
          <ul className="flex flex-col gap-y-1.5 rounded-panel border border-border-subtle p-4">
            {view.scopes.map((row) => (
              <li key={row.scope} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm text-ink">{row.label}</span>
                <span className="font-mono text-[10px] text-ink-muted">{row.scope}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )}

    {error !== undefined && (
      <p role="alert" className="rounded-md border border-danger bg-danger-wash px-3 py-2 text-xs text-danger">
        {error}
      </p>
    )}

    {categories.length > 0 && (
      <div className="flex flex-col gap-y-2 border-t border-border-subtle pt-4">
        <div className="flex flex-col gap-y-1">
          <h3 className="text-sm font-semibold text-ink">What Marcel may use</h3>
          <p className="text-sm text-ink-muted">Switch off anything you would rather it left alone. Open a row to see exactly what it covers.</p>
        </div>
        {categories.map((category) => (
          <CategoryToggleRow
            key={category.name}
            label={category.label}
            commandCount={category.commandCount}
            isEnabled={category.isEnabled}
            isLocked={category.isLocked}
            isExpanded={category.name === expandedCategory}
            {...(expandedCommand === undefined ? {} : { expandedCommand })}
            commands={category.commands}
            onToggle={() => onToggleCategory(category.name)}
            onToggleExpand={() => onExpandCategory(category.name)}
            onExpandCommand={onExpandCommand}
          />
        ))}
      </div>
    )}
  </section>
);

OfficePanel.displayName = 'OfficePanel';
