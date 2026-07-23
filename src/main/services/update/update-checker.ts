/*
 * Ask GitHub whether a newer release exists, on a leash and without ever failing loudly.
 *
 * The app is unsigned and cannot self-update, so this only ever informs: it reads the latest
 * release, and the renderer offers the DMG. Every failure (offline, rate-limited, timed out,
 * malformed) degrades to the last known status, which starts as "up to date". The parse and
 * the comparison are the pure update-check; this is the fetch, the deadline and the cache.
 *
 * fetch is injected (rule 13 custom-fetch seam), so the network is a fake in tests.
 */
import { evaluateRelease, parseRelease } from '../../../shared/update-check.ts';
import type { UpdateStatus } from '../../../shared/update-check.ts';

// The slice of fetch this uses. Not typeof fetch: Bun's global carries a preconnect method
// a plain wrapper cannot satisfy, and only this call shape is needed (rule 13 seam).
export type UpdateFetch = (url: string, init: { readonly headers: Record<string, string>; readonly signal: AbortSignal }) => Promise<Response>;

export type UpdateCheckerDeps = {
  readonly fetch: UpdateFetch;
  // owner/name, e.g. vdelacou/ask-marcel-studio.
  readonly repo: string;
  readonly currentVersion: string;
  readonly timeoutMs: number;
};

export type UpdateChecker = {
  // The last status learned. Cheap and synchronous: what the IPC handler returns.
  readonly current: () => UpdateStatus;
  // Hit the network and fold the result into the cache. Returns the (possibly unchanged) cache.
  readonly refresh: () => Promise<UpdateStatus>;
};

export const createUpdateChecker = (deps: UpdateCheckerDeps): UpdateChecker => {
  let cached: UpdateStatus = { current: deps.currentVersion, updateAvailable: false };

  const fetchLatest = async (): Promise<UpdateStatus | undefined> => {
    try {
      const response = await deps.fetch(`https://api.github.com/repos/${deps.repo}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(deps.timeoutMs),
      });
      if (!response.ok) return undefined;
      const release = parseRelease(await response.json());
      if (release === undefined) return undefined;
      return evaluateRelease({ current: deps.currentVersion, release });
    } catch {
      // Offline, timed out, rate-limited, or malformed: keep the status we had.
      return undefined;
    }
  };

  const refresh = async (): Promise<UpdateStatus> => {
    const fetched = await fetchLatest();
    if (fetched !== undefined) cached = fetched;
    return cached;
  };

  return { current: () => cached, refresh };
};
