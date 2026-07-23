/*
 * Keeps the Microsoft 365 dot honest.
 *
 * Wiring only: what the probe means is the pure, tested lib/office-health. This owns
 * when to ask (on mount, when the window comes back, and every five minutes) and the
 * two actions a user can take about it.
 *
 * The probe is a local token decode, no network, so polling it costs nothing.
 */
import { useCallback, useEffect, useState } from 'react';
import { healthFromStatus, loginErrorMessage, popoverViewFromStatus } from '../lib/office-health.ts';
import type { OfficeHealthView, OfficePopoverView } from '../lib/office-health.ts';
import type { OfficeStatus } from '../../../shared/office-status.ts';

const POLL_MS = 300_000;

export type OfficeHealthController = {
  readonly view: OfficeHealthView;
  readonly popover: OfficePopoverView;
  readonly isRefreshing: boolean;
  readonly isSigningOut: boolean;
  readonly error?: string;
  // Re-reads the tokens. Cheap.
  readonly reload: () => void;
  // A full browser sign-in, which is the only way back for the token that cannot
  // refresh itself. Resolves true when the sign-in finished, so the caller can close
  // the popover on success and leave it open, with a reason, on failure.
  readonly refresh: () => Promise<boolean>;
  readonly signOut: () => Promise<void>;
};

export const useOfficeHealth = (): OfficeHealthController => {
  const [status, setStatus] = useState<OfficeStatus>();
  const [isChecking, setIsChecking] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string>();

  const reload = useCallback((): void => {
    void (async (): Promise<void> => {
      const probe = await studio.office.status();
      // A probe that could not run is reported as signed out, because that is what the
      // user will experience either way.
      setStatus(probe.ok ? probe.value : undefined);
      setIsChecking(false);
    })();
  }, []);

  useEffect(reload, [reload]);

  useEffect(() => {
    const onFocus = (): void => reload();
    window.addEventListener('focus', onFocus);
    const timer = setInterval(reload, POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [reload]);

  const refresh = useCallback(async (): Promise<boolean> => {
    setError(undefined);
    setIsRefreshing(true);
    const done = await studio.office.login({ force: true });
    setIsRefreshing(false);
    // Closing the browser window mid-sign-in lands here: the button comes back and the
    // reason says trying again is all it takes.
    if (!done.ok) {
      setError(loginErrorMessage(done.error));
      return false;
    }
    reload();
    return true;
  }, [reload]);

  const signOut = useCallback(async (): Promise<void> => {
    setError(undefined);
    setIsSigningOut(true);
    const done = await studio.office.logout();
    setIsSigningOut(false);
    if (!done.ok) setError(loginErrorMessage(done.error));
    reload();
  }, [reload]);

  return {
    view: isChecking ? { health: 'checking', message: 'Checking your Microsoft 365 sign-in…' } : healthFromStatus(status),
    popover: popoverViewFromStatus(status, isChecking),
    isRefreshing,
    isSigningOut,
    ...(error === undefined ? {} : { error }),
    reload,
    refresh,
    signOut,
  };
};
