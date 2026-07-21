import { describe, expect, test } from 'bun:test';
import { createSignatureService } from './signature-service.ts';
import type { OfficeRun, OfficeRunOutcome } from './office-service.ts';

const SIGNATURE_PATH = '/data/claude-config/signature.html';

const ran = (over: Partial<Extract<OfficeRunOutcome, { ran: true }>> = {}): OfficeRunOutcome => ({ ran: true, stdout: '', stderr: '', code: 0, timedOut: false, ...over });

type Scripted = { readonly hasSignature?: boolean; readonly writes?: readonly boolean[]; readonly outcomes?: Readonly<Record<string, OfficeRunOutcome>> };

const service = (scripted: Scripted = {}): { readonly prefill: (force?: boolean) => Promise<ReturnType<typeof Object>>; readonly calls: string[][] } => {
  const calls: string[][] = [];
  const writes = [...(scripted.writes ?? [true])];
  const run: OfficeRun = (args) => {
    calls.push([...args]);
    return Promise.resolve(scripted.outcomes?.[args[0] ?? ''] ?? ran());
  };
  const built = createSignatureService({
    run,
    signaturePath: SIGNATURE_PATH,
    hasSignature: () => Promise.resolve(scripted.hasSignature ?? false),
    wroteSomething: () => Promise.resolve(writes.shift() ?? false),
  });
  return { prefill: (force = false) => built.prefill(force) as never, calls };
};

describe('taking the user’s signature from their mailbox', () => {
  test('a signature is fetched straight into the file the agent reads', async () => {
    const { prefill, calls } = service();

    expect(await prefill()).toEqual({ ok: true, value: null });
    expect(calls[1]).toEqual(['get-mail-signature', '--output-path', SIGNATURE_PATH]);
  });

  test('a signature the user already has is never overwritten', async () => {
    // The moment they edit it, it is theirs.
    const { prefill, calls } = service({ hasSignature: true });

    const done = await prefill();

    expect(done).toEqual({ ok: false, error: { kind: 'skipped', message: 'there is already a signature' } });
    expect(calls).toEqual([]);
  });

  test('asking for it explicitly overwrites what is there', async () => {
    const { prefill, calls } = service({ hasSignature: true });

    expect(await prefill(true)).toEqual({ ok: true, value: null });
    expect(calls[0]?.[0]).toBe('scopes-check');
  });

  test('a user who has not signed in yet is skipped quietly', async () => {
    const { prefill } = service({ outcomes: { 'scopes-check': ran({ code: 1 }) } });

    expect(await prefill()).toEqual({ ok: false, error: { kind: 'skipped', message: 'not signed in to Microsoft 365 yet' } });
  });

  test('a CLI that cannot be launched at all is skipped quietly too', async () => {
    const run: OfficeRun = () => Promise.resolve({ ran: false, message: 'ENOENT' });
    const built = createSignatureService({ run, signaturePath: SIGNATURE_PATH, hasSignature: () => Promise.resolve(false), wroteSomething: () => Promise.resolve(false) });

    expect((await built.prefill(false)).ok).toBe(false);
  });

  test('when the CLI finds no signature on its own, a sent message is named for it', async () => {
    const sent = JSON.stringify({ ok: true, data: { value: [{ id: 'AAA' }] } });
    const { prefill, calls } = service({ writes: [false, true], outcomes: { 'list-mail-folder-messages': ran({ stdout: sent }) } });

    expect(await prefill()).toEqual({ ok: true, value: null });
    expect(calls.at(-1)).toEqual(['get-mail-signature', '--output-path', SIGNATURE_PATH, '--message-id', 'AAA']);
  });

  test('an empty sent folder is skipped: there is nothing to take one from yet', async () => {
    const empty = JSON.stringify({ ok: true, data: { value: [] } });
    const { prefill } = service({ writes: [false], outcomes: { 'list-mail-folder-messages': ran({ stdout: empty }) } });

    expect(await prefill()).toEqual({ ok: false, error: { kind: 'skipped', message: 'no sent message to take a signature from yet' } });
  });

  test('a sent message carrying no signature block is skipped rather than reported as done', async () => {
    const sent = JSON.stringify({ ok: true, data: { value: [{ id: 'AAA' }] } });
    const { prefill } = service({ writes: [false, false], outcomes: { 'list-mail-folder-messages': ran({ stdout: sent }) } });

    expect((await prefill()).ok).toBe(false);
  });

  test('a listing that fails is skipped rather than retried forever', async () => {
    const { prefill } = service({ writes: [false], outcomes: { 'list-mail-folder-messages': ran({ code: 1 }) } });

    expect((await prefill()).ok).toBe(false);
  });
});
