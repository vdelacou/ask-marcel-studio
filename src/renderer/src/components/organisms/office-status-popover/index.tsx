import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';

export type OfficeHealthKind = 'checking' | 'healthy' | 'attention' | 'signed-out';

// What the dot in the sidebar says when it is clicked: the state in one sentence, and
// the one action that fixes it.
export type OfficeStatusPopoverProps = {
  health: OfficeHealthKind;
  message: string;
  isRefreshing: boolean;
  error?: string;
  onRefresh: () => void;
  onOpenSettings: () => void;
};

export const OfficeStatusPopover: FC<OfficeStatusPopoverProps> = ({ health, message, isRefreshing, error, onRefresh, onOpenSettings }) => (
  <div className="absolute bottom-full left-2 z-20 mb-2 w-64 rounded-panel border border-border-subtle bg-surface p-3 shadow-lg">
    <p className="text-sm text-ink">{message}</p>
    {error !== undefined && (
      <p role="alert" className="mt-2 rounded-md border border-danger bg-danger-wash px-2 py-1 text-xs text-danger">
        {error}
      </p>
    )}
    <div className="mt-3 flex items-center justify-between gap-x-2">
      <Button variant={health === 'healthy' ? 'secondary' : 'primary'} onClick={onRefresh} disabled={isRefreshing}>
        {isRefreshing ? 'Signing in…' : 'Refresh sign-in'}
      </Button>
      <button type="button" onClick={onOpenSettings} className="rounded-md px-1 text-xs text-ink-muted underline-offset-4 transition hover:text-ink hover:underline">
        Open settings
      </button>
    </div>
  </div>
);

OfficeStatusPopover.displayName = 'OfficeStatusPopover';
