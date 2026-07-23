import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { Popover } from '../../molecules/popover/index.tsx';

export type OfficeHealthKind = 'checking' | 'healthy' | 'attention' | 'signed-out';

// What the dot in the sidebar says when it is clicked. Two failures live behind one dot,
// and they need different words: a token tier that died costs named abilities and is
// fixed by a refresh, while an ended sign-in costs everything and needs a real sign-in.
export type OfficeStatusPopoverProps = {
  health: OfficeHealthKind;
  headline: string;
  unavailable: readonly string[];
  action: 'refresh' | 'sign-in';
  canSignOut: boolean;
  isRefreshing: boolean;
  isSigningOut: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
  onDismiss: () => void;
  reassurance?: string;
  error?: string;
};

const refreshLabel = (action: 'refresh' | 'sign-in', isRefreshing: boolean): string => {
  if (isRefreshing) return 'Signing in…';
  return action === 'sign-in' ? 'Sign in' : 'Refresh sign-in';
};

export const OfficeStatusPopover: FC<OfficeStatusPopoverProps> = ({
  health,
  headline,
  unavailable,
  action,
  canSignOut,
  isRefreshing,
  isSigningOut,
  onRefresh,
  onSignOut,
  onDismiss,
  reassurance,
  error,
}) => (
  <Popover placement="up-start" dismissLabel="Close sign-in details" onDismiss={onDismiss}>
    <div className="flex w-72 flex-col gap-y-2 p-2">
      <p className={`text-sm ${health === 'signed-out' ? 'text-danger' : 'text-ink'}`}>{headline}</p>
      {unavailable.length > 0 && (
        <ul className="flex list-disc flex-col gap-y-1 pl-4 text-xs text-ink-muted">
          {unavailable.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      )}
      {reassurance !== undefined && <p className="text-xs text-ink-muted">{reassurance}</p>}
      {error !== undefined && (
        <p role="alert" className="rounded-md border border-danger bg-danger-wash px-2 py-1 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-x-2 pt-1">
        <Button variant={health === 'healthy' ? 'secondary' : 'primary'} onClick={onRefresh} disabled={isRefreshing || isSigningOut}>
          {refreshLabel(action, isRefreshing)}
        </Button>
        {canSignOut && (
          <Button variant="secondary" onClick={onSignOut} disabled={isRefreshing || isSigningOut}>
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </Button>
        )}
      </div>
    </div>
  </Popover>
);

OfficeStatusPopover.displayName = 'OfficeStatusPopover';
