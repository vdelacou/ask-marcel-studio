import { describe, expect, test } from 'bun:test';
import { createOfficeService } from './office-service.ts';
import type { OfficeRun, OfficeRunOutcome } from './office-service.ts';

type RanOverrides = Partial<Omit<Extract<OfficeRunOutcome, { ran: true }>, 'ran'>>;
const ran = (over: RanOverrides): OfficeRunOutcome => ({ ran: true, stdout: '', stderr: '', code: 0, timedOut: false, ...over });

const signedInJson = JSON.stringify({ ok: true, data: { scopes: ['Mail.Read'], expiresAt: '2026-07-20T06:39:04.000Z' } });

describe('probing office sign-in status', () => {
  test('a cached token is reported as signed in', async () => {
    const run: OfficeRun = async () => ran({ stdout: signedInJson });

    const result = await createOfficeService(run).status();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.signedIn).toBe(true);
  });

  test('a failure to launch the cli surfaces as an error, not a signed-out status', async () => {
    const run: OfficeRun = async () => ({ ran: false, message: 'spawn ENOENT' });

    const result = await createOfficeService(run).status();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.kind).toBe('spawn-failed');
  });
});

describe('driving the interactive login', () => {
  test('a successful login resolves ok', async () => {
    const run: OfficeRun = async () => ran({ code: 0 });

    expect((await createOfficeService(run).login()).ok).toBe(true);
  });

  test('a login that exits non-zero reports why', async () => {
    const run: OfficeRun = async () => ran({ code: 1, stderr: 'sign-in was cancelled' });

    const result = await createOfficeService(run).login();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.kind).toBe('login-failed');
    expect(result.error.message).toContain('cancelled');
  });

  test('a login that overruns its deadline is reported as timed out', async () => {
    const run: OfficeRun = async () => ran({ timedOut: true, code: 124 });

    const result = await createOfficeService(run).login();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.kind).toBe('timed-out');
  });

  test('a second login while one is still running is refused as busy, and never launches a second browser', async () => {
    let launches = 0;
    const run: OfficeRun = () => {
      launches += 1;
      // Never resolves: the first login stays in flight for the length of the test.
      return new Promise<OfficeRunOutcome>(() => undefined);
    };
    const office = createOfficeService(run);

    void office.login();
    const second = await office.login();

    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('expected err');
    expect(second.error.kind).toBe('busy');
    expect(launches).toBe(1);
  });
});
