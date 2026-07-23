/*
 * What to call the user.
 *
 * Their own name, from the quick context the app fetched once from Microsoft 365. Absent
 * until that lands (or forever, if they never sign in), which is why every consumer has a
 * fallback rather than a placeholder name.
 */
import { useCallback, useEffect, useState } from 'react';
import type { QuickContext } from '../../../shared/quick-context.ts';

export type UserIdentity = {
  readonly context?: QuickContext;
  readonly reload: () => void;
};

export const useUserIdentity = (): UserIdentity => {
  const [context, setContext] = useState<QuickContext>();

  const reload = useCallback((): void => {
    void (async (): Promise<void> => {
      setContext(await studio.office.quickContext());
    })();
  }, []);

  useEffect(reload, [reload]);

  return { ...(context === undefined ? {} : { context }), reload };
};
