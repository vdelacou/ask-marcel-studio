/*
 * Keeping the user's quick context on disk.
 *
 * The CLI's `my-quick-context` is nine Graph calls. The agent used to be told to run it
 * once per session, which meant every new conversation paid for it again, and the answer
 * was never available before the first question. The app fetches it instead: after a
 * successful sign-in, and at launch when what is stored has gone stale.
 *
 * Every dependency is injected (rule 13), so a test spawns no process and touches no
 * disk. Failure is silent by design, exactly like the signature service: an app that
 * cannot fetch this is an app that answers slightly less well, not one that stops.
 */
import { isQuickContextStale, parseQuickContext, quickContextBlock } from '../../../shared/quick-context.ts';
import type { QuickContext } from '../../../shared/quick-context.ts';
import type { OfficeRun } from './office-service.ts';

export type StoredQuickContext = {
  readonly fetchedAt: string;
  readonly context: QuickContext;
};

export type QuickContextServiceDeps = {
  readonly run: OfficeRun;
  readonly now: () => Date;
  readonly read: () => Promise<StoredQuickContext | undefined>;
  readonly write: (stored: StoredQuickContext) => Promise<void>;
};

export type QuickContextService = {
  // What the UI shows (the user's own name) and what the prompt carries.
  readonly current: () => QuickContext | undefined;
  readonly block: () => string;
  // force ignores the age check: used after a sign-in, when the answer may have changed.
  readonly refresh: (force: boolean) => Promise<void>;
  readonly load: () => Promise<void>;
};

const FETCH_TIMEOUT_MS = 60_000;

export const createQuickContextService = (deps: QuickContextServiceDeps): QuickContextService => {
  let cached: StoredQuickContext | undefined;

  const load = async (): Promise<void> => {
    cached = await deps.read();
  };

  const refresh = async (force: boolean): Promise<void> => {
    if (!force && !isQuickContextStale(cached?.fetchedAt, deps.now())) return;
    const outcome = await deps.run(['my-quick-context', '--output', 'json'], FETCH_TIMEOUT_MS);
    if (!outcome.ran) return;
    const context = parseQuickContext(outcome.stdout);
    // A failed fetch keeps whatever was stored: stale beats absent, and the user's name
    // does not change while their token does.
    if (context === undefined) return;
    const stored: StoredQuickContext = { fetchedAt: deps.now().toISOString(), context };
    cached = stored;
    await deps.write(stored);
  };

  return {
    current: () => cached?.context,
    block: () => quickContextBlock(cached?.context),
    refresh,
    load,
  };
};
