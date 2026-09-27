import { describe, expect, test } from 'bun:test';
import { claudeCodeBinarySpecifier, parseClaudeAuthStatus } from './claude-plan.ts';

// What `claude auth status --json` prints, captured from Claude Code 2.1.185.
const signedInOnPlan = JSON.stringify({
  loggedIn: true,
  authMethod: 'claude.ai',
  apiProvider: 'firstParty',
  email: 'ada@example.com',
  orgId: 'o-1',
  orgName: 'Example',
  subscriptionType: 'max',
});

describe('reading who is signed in to Claude Code', () => {
  test('a Claude subscription sign-in reads as signed in, with the account and the plan', () => {
    expect(parseClaudeAuthStatus(signedInOnPlan)).toEqual({ ok: true, value: { signedIn: true, email: 'ada@example.com', plan: 'max' } });
  });

  test('nobody signed in reads as signed out, not as a failure', () => {
    const stdout = JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' });

    expect(parseClaudeAuthStatus(stdout)).toEqual({ ok: true, value: { signedIn: false } });
  });

  test('an api key is not a plan sign-in', () => {
    const stdout = JSON.stringify({ loggedIn: true, authMethod: 'api_key', apiProvider: 'firstParty', apiKeySource: 'ANTHROPIC_API_KEY' });

    expect(parseClaudeAuthStatus(stdout)).toEqual({ ok: true, value: { signedIn: false } });
  });

  test('a plan sign-in with no account details on record still counts', () => {
    const stdout = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', email: null, orgId: null, orgName: null, subscriptionType: null });

    // Strict: an email or plan key holding undefined would still print as "Signed in as undefined".
    expect(parseClaudeAuthStatus(stdout)).toStrictEqual({ ok: true, value: { signedIn: true } });
  });

  test('text that is not the status json is refused rather than guessed', () => {
    const result = parseClaudeAuthStatus('Not logged in · Please run /login');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });

  test('json with no loggedIn flag is refused', () => {
    const result = parseClaudeAuthStatus(JSON.stringify({ authMethod: 'none' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });
});

describe('finding the Claude Code the agent itself runs', () => {
  test('on a mac it is the platform package claude binary', () => {
    expect(claudeCodeBinarySpecifier('darwin', 'x64')).toBe('@anthropic-ai/claude-agent-sdk-darwin-x64/claude');
  });

  test('on windows the binary carries its exe', () => {
    expect(claudeCodeBinarySpecifier('win32', 'x64')).toBe('@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe');
  });
});
