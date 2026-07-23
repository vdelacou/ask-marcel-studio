/*
 * Whether a newer build exists, and what version is running.
 *
 * Main checks GitHub on a schedule and caches the answer; this reads that cache once when
 * the window opens. Two consumers: the banner (only when an update was found) and the
 * version line in settings (always). No polling: a day-old answer is fine for an unsigned
 * app the user updates by hand.
 */
import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../../shared/update-check.ts';

export const useUpdate = (): UpdateStatus | undefined => {
  const [status, setStatus] = useState<UpdateStatus>();

  useEffect(() => {
    void (async (): Promise<void> => {
      setStatus(await studio.update.status());
    })();
  }, []);

  return status;
};
