import { describe, expect, test } from 'bun:test';
import { buildSessionEnv } from './session-env.ts';
import type { Provider } from './types.ts';

const USER_DATA = '/Users/someone/Library/Application Support/ask-marcel-studio';

// What a developer who also uses Claude Code may have exported in the shell that launched the
// app. Probed 2026-10-04 against the bundled Claude Code 2.1.185: a turn on a key sent
// ANTHROPIC_AUTH_TOKEN along as a bearer header next to the key, and with
// CLAUDE_CODE_USE_BEDROCK set, Claude Code switched to Bedrock and not one request reached the
// provider. CLAUDE_CODE_OAUTH_TOKEN was not sent, but the agent runs a shell that can read its
// environment, so a sign-in token has no business there either.
const DEVELOPER_SHELL = {
  PATH: '/usr/bin:/bin',
  HOME: '/Users/someone',
  ANTHROPIC_AUTH_TOKEN: 'bearer-from-the-shell',
  CLAUDE_CODE_OAUTH_TOKEN: 'oauth-from-the-shell',
  CLAUDE_CODE_USE_BEDROCK: '1',
  CLAUDE_CODE_USE_VERTEX: '1',
  CLAUDE_CODE_USE_FOUNDRY: '1',
};

const SHELL_ONLY = ['ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'];

const proxied: Provider = { id: 'team-proxy', kind: 'anthropic', label: 'Team proxy', baseUrl: 'https://llm-proxy.example', apiKey: 'sk-ant-team', modelIds: ['claude-opus-4-8'] };
const lmStudio: Provider = { id: 'lmstudio', kind: 'openai', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'sk-upstream', modelIds: ['qwen2.5'] };
const GATEWAY = { baseUrl: 'http://127.0.0.1:51999', apiKey: 'gateway-run-key' };

const onKey = (): Record<string, string> =>
  buildSessionEnv({ provider: proxied, modelId: 'claude-opus-4-8', configRoot: USER_DATA, toolsRoot: USER_DATA, inheritedEnv: DEVELOPER_SHELL });

describe('keeping the developer’s own Claude Code settings out of a turn on a key', () => {
  test('a provider behind a proxy authenticates with its own key, and the bearer token from the developer’s shell never travels with it', () => {
    const env = onKey();

    expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-team');
    expect('ANTHROPIC_AUTH_TOKEN' in env).toBe(false);
    expect('CLAUDE_CODE_OAUTH_TOKEN' in env).toBe(false);
  });

  test('a cloud switch exported in the developer’s shell cannot take a turn on a key to Bedrock, Vertex or Foundry', () => {
    const env = onKey();

    expect('CLAUDE_CODE_USE_BEDROCK' in env).toBe(false);
    expect('CLAUDE_CODE_USE_VERTEX' in env).toBe(false);
    expect('CLAUDE_CODE_USE_FOUNDRY' in env).toBe(false);
    expect(env['ANTHROPIC_BASE_URL']).toBe('https://llm-proxy.example');
  });

  test('a provider with an empty base url stays on the real Anthropic API, whatever base url the developer’s shell exported', () => {
    const blank: Provider = { id: 'team-direct', kind: 'anthropic', label: 'Team', baseUrl: '', apiKey: 'sk-ant-team', modelIds: ['claude-opus-4-8'] };

    const env = buildSessionEnv({
      provider: blank,
      modelId: 'claude-opus-4-8',
      configRoot: USER_DATA,
      toolsRoot: USER_DATA,
      inheritedEnv: { ...DEVELOPER_SHELL, ANTHROPIC_BASE_URL: 'https://stale.example' },
    });

    expect('ANTHROPIC_BASE_URL' in env).toBe(false);
  });

  test('a turn through the gateway carries only the gateway key, whatever the developer’s shell exported', () => {
    const env = buildSessionEnv({ provider: lmStudio, modelId: 'qwen2.5', configRoot: USER_DATA, toolsRoot: USER_DATA, inheritedEnv: DEVELOPER_SHELL, gateway: GATEWAY });

    expect(env['ANTHROPIC_API_KEY']).toBe('gateway-run-key');
    for (const name of SHELL_ONLY) expect(name in env).toBe(false);
  });
});
