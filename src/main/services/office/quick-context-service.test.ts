import { describe, expect, test } from 'bun:test';
import { createQuickContextService } from './quick-context-service.ts';
import type { StoredQuickContext } from './quick-context-service.ts';
import type { OfficeRun, OfficeRunOutcome } from './office-service.ts';

const contextJson = JSON.stringify({
  ok: true,
  data: { user: { id: 'u1', displayName: 'Vincent DELACOURT', mail: 'v@x.com', jobTitle: 'CIO' }, tenantTimeZone: 'China Standard Time' },
});

const ran = (stdout: string): OfficeRunOutcome => ({ ran: true, stdout, stderr: '', code: 0, timedOut: false });

// Hand-written fakes (rule 13): no process is spawned and nothing is written.
const harness = (
  options: { readonly stored?: StoredQuickContext; readonly outcome?: OfficeRunOutcome; readonly at?: string } = {}
): {
  readonly service: ReturnType<typeof createQuickContextService>;
  readonly calls: string[][];
  readonly written: StoredQuickContext[];
} => {
  const calls: string[][] = [];
  const written: StoredQuickContext[] = [];
  const run: OfficeRun = (args) => {
    calls.push([...args]);
    return Promise.resolve(options.outcome ?? ran(contextJson));
  };
  const service = createQuickContextService({
    run,
    now: () => new Date(options.at ?? '2026-07-21T00:00:00.000Z'),
    read: () => Promise.resolve(options.stored),
    write: (stored) => {
      written.push(stored);
      return Promise.resolve();
    },
  });
  return { service, calls, written };
};

const storedAt = (fetchedAt: string): StoredQuickContext => ({
  fetchedAt,
  context: { displayName: 'Old Name', firstName: 'Old', email: 'old@x.com', ids: {} },
});

describe('keeping the user’s quick context', () => {
  test('with nothing stored, the app asks the cli and keeps the answer', async () => {
    const { service, calls, written } = harness();

    await service.load();
    await service.refresh(false);

    expect(calls[0]).toEqual(['my-quick-context', '--output', 'json']);
    expect(service.current()?.firstName).toBe('Vincent');
    expect(written[0]?.context.displayName).toBe('Vincent DELACOURT');
  });

  test('a context fetched yesterday is reused, so launching costs nothing', async () => {
    const { service, calls } = harness({ stored: storedAt('2026-07-20T00:00:00.000Z') });

    await service.load();
    await service.refresh(false);

    expect(calls).toEqual([]);
    expect(service.current()?.firstName).toBe('Old');
  });

  test('a context from last month is fetched again', async () => {
    const { service, calls } = harness({ stored: storedAt('2026-06-01T00:00:00.000Z') });

    await service.load();
    await service.refresh(false);

    expect(calls).toHaveLength(1);
    expect(service.current()?.firstName).toBe('Vincent');
  });

  test('after signing in, the context is fetched again however fresh it looked', async () => {
    const { service, calls } = harness({ stored: storedAt('2026-07-20T00:00:00.000Z') });

    await service.load();
    await service.refresh(true);

    expect(calls).toHaveLength(1);
  });

  test('a cli that cannot answer leaves the last good context in place', async () => {
    const { service, written } = harness({ stored: storedAt('2026-06-01T00:00:00.000Z'), outcome: { ran: false, message: 'spawn ENOENT' } });

    await service.load();
    await service.refresh(true);

    expect(service.current()?.firstName).toBe('Old');
    expect(written).toEqual([]);
  });

  test('a signed-out answer is not written over what is known', async () => {
    const { service, written } = harness({ stored: storedAt('2026-06-01T00:00:00.000Z'), outcome: ran(JSON.stringify({ ok: false, error: 'not_authenticated' })) });

    await service.load();
    await service.refresh(true);

    expect(service.current()?.displayName).toBe('Old Name');
    expect(written).toEqual([]);
  });

  test('the prompt block names the user once the context is known, and is empty before that', async () => {
    const { service } = harness();

    expect(service.block()).toBe('');
    await service.refresh(true);

    expect(service.block()).toContain('Vincent DELACOURT');
  });
});
