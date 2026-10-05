import { describe, expect, test } from 'bun:test';
import { buildSessionEnv, buildSignInEnv } from './session-env.ts';
import type { Provider } from './types.ts';

const USER_DATA = '/Users/someone/Library/Application Support/ask-marcel-studio';

// Provider switches the Claude Code bundled with SDK 0.3.289 (2.1.289) reads. Probed
// 2026-10-04: exported in the shell that launched the app, each one set to 1 failed a turn on
// a key before a single request reached the provider (no AWS or Google Cloud workspace, no
// AWS credentials). CLAUDE_CODE_USE_GATEWAY, set the same way, moved nothing.
const NEWER_SWITCHES = ['CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD', 'CLAUDE_CODE_USE_MANTLE'];

const SHELL = { PATH: '/usr/bin:/bin', HOME: '/Users/someone', ...Object.fromEntries(NEWER_SWITCHES.map((name) => [name, '1'])) };

const keyed: Provider = { id: 'anthropic-work', kind: 'anthropic', label: 'Anthropic', apiKey: 'sk-ant-team', modelIds: ['claude-opus-4-8'] };
const lmStudio: Provider = { id: 'lmstudio', kind: 'openai', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'sk-upstream', modelIds: ['qwen2.5'] };
const plan: Provider = { id: 'claude', kind: 'claude-plan', label: 'Claude', modelIds: ['sonnet'] };

const survivors = (env: Readonly<Record<string, string>>): string[] => NEWER_SWITCHES.filter((name) => name in env);

describe('keeping the newer cloud switches in the developer’s shell out of every turn', () => {
  test('a turn on a key stays with its provider, whatever AWS, Google Cloud or Mantle switch the shell exported', () => {
    const env = buildSessionEnv({ provider: keyed, modelId: 'claude-opus-4-8', configRoot: USER_DATA, toolsRoot: USER_DATA, inheritedEnv: SHELL });

    expect(survivors(env)).toEqual([]);
    expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-team');
  });

  test('a turn through the gateway stays on the gateway', () => {
    const gateway = { baseUrl: 'http://127.0.0.1:51999', apiKey: 'gateway-run-key' };

    const env = buildSessionEnv({ provider: lmStudio, modelId: 'qwen2.5', configRoot: USER_DATA, toolsRoot: USER_DATA, inheritedEnv: SHELL, gateway });

    expect(survivors(env)).toEqual([]);
  });

  test('a Claude plan turn stays on the plan', () => {
    const env = buildSessionEnv({ provider: plan, modelId: 'sonnet', configRoot: USER_DATA, toolsRoot: USER_DATA, inheritedEnv: SHELL });

    expect(survivors(env)).toEqual([]);
  });

  test('signing in to a Claude plan is not sent to a cloud provider either', () => {
    const env = buildSignInEnv({ configRoot: USER_DATA, inheritedEnv: SHELL });

    expect(survivors(env)).toEqual([]);
    expect(env['PATH']).toBe('/usr/bin:/bin');
  });
});
