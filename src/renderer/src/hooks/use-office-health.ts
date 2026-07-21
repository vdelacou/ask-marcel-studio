/*
 * Keeps the Microsoft 365 dot honest.
 *
 * Wiring only: what the probe means is the pure, tested lib/office-health. This owns
 * when to ask (on mount, when the window comes back, and every five minutes) and the
 * one action that fixes it.
 *
 * The probe is a local token decode, no network, so polling it costs nothing.
 */
import { useCallback, useEffect, useState } from 'react';
import { healthFromStatus } from '../lib/office-health.ts';
import type { OfficeHealthView } from '../lib/office-health.ts';

const POLL_MS = 300_000;

export type OfficeHealthController = {
  readonly view: OfficeHealthView;
  readonly isRefreshing: boolean;
  readonly error?: string;
  // Re-reads the tokens. Cheap.
  readonly reload: () => void;
  // A full browser sign-in, which is the only way back for the token that cannot
  // refresh itself.
  readonly refresh: () => void;
};

export const useOfficeHealth = (): OfficeHealthController => {
  const [view, setView] = useState<OfficeHealthView>({ health: 'checking', message: 'Checking your Microsoft 365 sign-in…' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string>();

  const reload = useCallback((): void => {
    void (async (): Promise<void> => {
      const status = await studio.office.status();
      // A probe that could not run is reported as signed out, because that is what the
      // user will experience either way.
      setView(healthFromStatus(status.ok ? status.value : undefined));
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

  const refresh = useCallback((): void => {
    setError(undefined);
    setIsRefreshing(true);
    void (async (): Promise<void> => {
      const done = await studio.office.login({ force: true });
      setIsRefreshing(false);
      if (!done.ok) {
        setError(done.error.message);
        return;
      }
      reload();
    })();
  }, [reload]);

  return { view, isRefreshing, ...(error === undefined ? {} : { error }), reload, refresh };
};
