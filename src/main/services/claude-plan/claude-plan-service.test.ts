import { describe, expect, test } from 'bun:test';
import { createClaudePlanService } from './claude-plan-service.ts';
import type { ClaudeRun, ClaudeRunOutcome } from './claude-plan-service.ts';

type RanOverrides = Partial<Omit<Extract<ClaudeRunOutcome, { ran: true }>, 'ran'>>;
const ran = (over: RanOverrides): ClaudeRunOutcome => ({ ran: true, stdout: '', stderr: '', code: 0, timedOut: false, ...over });

// What `claude auth status --json` prints for a Max plan sign-in (Claude Code 2.1.185).
const signedInJson = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', email: 'ada@example.com', subscriptionType: 'max' });

// A run that answers `auth status` with the sign-in above and every other command with
// `other`, recording what it was asked to run.
const scripted = (other: ClaudeRunOutcome): { readonly run: ClaudeRun; readonly calls: (readonly string[])[] } => {
  const calls: (readonly string[])[] = [];
  const run: ClaudeRun = async (args) => {
    calls.push(args);
    return args[1] === 'status' ? ran({ stdout: signedInJson }) : other;
  };
  return { run, calls };
};

describe('asking Claude Code who is signed in', () => {
  test('the sign-in status comes from Claude Code itself', async () => {
    const { run, calls } = scripted(ran({}));

    const result = await createClaudePlanService(run).status();

    expect(calls).toEqual([['auth', 'status', '--json']]);
    expect(result).toEqual({ ok: true, value: { signedIn: true, email: 'ada@example.com', plan: 'max' } });
  });

  test('a Claude Code that cannot start is reported as such, not as signed out', async () => {
    const run: ClaudeRun = async () => ({ ran: false, message: 'spawn ENOENT' });

    const result = await createClaudePlanService(run).status();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('spawn-failed');
  });

  test('a status Claude Code printed that cannot be read is reported, not guessed', async () => {
    const run: ClaudeRun = async () => ran({ stdout: 'garbage' });

    const result = await createClaudePlanService(run).status();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unreadable');
  });
});

describe('signing in to a Claude plan', () => {
  test('signing in runs Claude Code’s own subscription login, then reports who is signed in', async () => {
    const { run, calls } = scripted(ran({ stdout: 'Login successful.\n' }));

    const result = await createClaudePlanService(run).login();

    expect(calls).toEqual([
      ['auth', 'login', '--claudeai'],
      ['auth', 'status', '--json'],
    ]);
    expect(result).toEqual({ ok: true, value: { signedIn: true, email: 'ada@example.com', plan: 'max' } });
  });

  test('a second sign-in while one is open is refused, so only one browser window opens', async () => {
    let finish: ((outcome: ClaudeRunOutcome) => void) | undefined;
    const run: ClaudeRun = (args) => {
      if (args[1] !== 'login') return Promise.resolve(ran({ stdout: signedInJson }));
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    const service = createClaudePlanService(run);

    const first = service.login();
    const second = await service.login();
    finish?.(ran({}));

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe('busy');
    expect((await first).ok).toBe(true);
  });

  test('a sign-in left open past its deadline is stopped and reported', async () => {
    const { run } = scripted(ran({ code: -1, timedOut: true }));

    const result = await createClaudePlanService(run).login();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('timed-out');
  });

  test('a sign-in that fails carries Claude Code’s own reason', async () => {
    const { run } = scripted(ran({ code: 1, stderr: 'Login failed: access denied\n' }));

    const result = await createClaudePlanService(run).login();

    expect(result).toEqual({ ok: false, error: { kind: 'login-failed', message: 'Login failed: access denied' } });
  });
});
