import { describe, expect, test } from 'bun:test';
import { buildSessionEnv } from './session-env.ts';
import type { Provider } from './types.ts';

const USER_DATA = '/Users/someone/Library/Application Support/ask-marcel-studio';
const INHERITED = { PATH: '/usr/bin:/bin', HOME: '/Users/someone', LANG: 'en_US.UTF-8' };

const anthropic: Provider = { id: 'anthropic-work', kind: 'anthropic', label: 'Anthropic', apiKey: 'sk-ant-real', modelIds: ['claude-opus-4-8'] };

const build = (provider: Provider, modelId = 'claude-opus-4-8'): Record<string, string> => buildSessionEnv({ provider, modelId, userData: USER_DATA, inheritedEnv: INHERITED });

describe('giving the agent what every conversation needs', () => {
  test('the agent loads its skills from the app config folder, not the developer own', () => {
    expect(build(anthropic)['CLAUDE_CONFIG_DIR']).toBe(`${USER_DATA}/claude-config`);
  });

  test('the office cli shim is found first on the path', () => {
    const path = build(anthropic)['PATH'];

    expect(path?.startsWith(`${USER_DATA}/bin:`)).toBe(true);
  });

  test('the inherited path is kept after the shim, so the agent can still run git and node', () => {
    expect(build(anthropic)['PATH']).toBe(`${USER_DATA}/bin:/usr/bin:/bin`);
  });

  test('an agent launched with no path at all still gets the shim', () => {
    const env = buildSessionEnv({ provider: anthropic, modelId: 'm', userData: USER_DATA, inheritedEnv: { HOME: '/Users/someone' } });

    expect(env['PATH']).toBe(`${USER_DATA}/bin`);
  });

  test('the update notifier is silenced, since its output would land mid-conversation', () => {
    expect(build(anthropic)['NO_UPDATE_NOTIFIER']).toBe('1');
  });

  test('the rest of the environment is passed through, so the agent inherits the shell it needs', () => {
    expect(build(anthropic)['HOME']).toBe('/Users/someone');
    expect(build(anthropic)['LANG']).toBe('en_US.UTF-8');
  });

  test('an inherited variable with no value is dropped rather than passed as the text undefined', () => {
    const env = buildSessionEnv({ provider: anthropic, modelId: 'm', userData: USER_DATA, inheritedEnv: { HOME: '/h', EMPTY: undefined } });

    expect('EMPTY' in env).toBe(false);
  });
});

describe('pointing the agent at an anthropic provider', () => {
  test('the provider key is what the agent authenticates with', () => {
    expect(build(anthropic)['ANTHROPIC_API_KEY']).toBe('sk-ant-real');
  });

  test('a provider with no base url leaves the agent on the real anthropic api', () => {
    expect('ANTHROPIC_BASE_URL' in build(anthropic)).toBe(false);
  });

  test('a provider with a proxy base url sends the agent there', () => {
    const env = build({ ...anthropic, baseUrl: 'https://proxy.internal' });

    expect(env['ANTHROPIC_BASE_URL']).toBe('https://proxy.internal');
  });

  test('a base url the user typed with a trailing /v1 is stripped, because the sdk appends its own', () => {
    // Left alone this becomes https://proxy.internal/v1/v1/messages.
    const env = build({ ...anthropic, baseUrl: 'https://proxy.internal/v1' });

    expect(env['ANTHROPIC_BASE_URL']).toBe('https://proxy.internal');
  });

  test('a base url with a trailing slash after /v1 is stripped too', () => {
    expect(build({ ...anthropic, baseUrl: 'https://proxy.internal/v1/' })['ANTHROPIC_BASE_URL']).toBe('https://proxy.internal');
  });

  test('a base url with a trailing slash keeps its path but loses the slash', () => {
    expect(build({ ...anthropic, baseUrl: 'https://proxy.internal/api/' })['ANTHROPIC_BASE_URL']).toBe('https://proxy.internal/api');
  });

  test('a base url that merely contains v1 in a hostname is left alone', () => {
    expect(build({ ...anthropic, baseUrl: 'https://v1.proxy.internal' })['ANTHROPIC_BASE_URL']).toBe('https://v1.proxy.internal');
  });
});

describe('keeping every model call on the model the user picked', () => {
  // The agent makes background calls (titles, summaries, fast paths) that would
  // otherwise silently use a default model on the user's key. Pinning all four
  // vars means no call can escape the chosen model.
  test('the chosen model is the session model', () => {
    expect(build(anthropic, 'claude-opus-4-8')['ANTHROPIC_MODEL']).toBe('claude-opus-4-8');
  });

  test('a background call that reaches for opus gets the chosen model instead', () => {
    expect(build(anthropic, 'claude-sonnet-5')['ANTHROPIC_DEFAULT_OPUS_MODEL']).toBe('claude-sonnet-5');
  });

  test('a background call that reaches for sonnet gets the chosen model instead', () => {
    expect(build(anthropic, 'claude-opus-4-8')['ANTHROPIC_DEFAULT_SONNET_MODEL']).toBe('claude-opus-4-8');
  });

  test('a fast background call that reaches for haiku gets the chosen model instead', () => {
    expect(build(anthropic, 'claude-opus-4-8')['ANTHROPIC_DEFAULT_HAIKU_MODEL']).toBe('claude-opus-4-8');
  });
});

describe('never letting the environment leak the wrong way', () => {
  test('the builder does not mutate the environment it was handed', () => {
    const inherited = { PATH: '/usr/bin', HOME: '/h' };

    buildSessionEnv({ provider: anthropic, modelId: 'm', userData: USER_DATA, inheritedEnv: inherited });

    // process.env is shared mutable state; the builder is pure and must copy.
    expect(inherited).toEqual({ PATH: '/usr/bin', HOME: '/h' });
  });

  test('an inherited anthropic key from the developer own shell cannot outrank the provider key', () => {
    const env = buildSessionEnv({
      provider: anthropic,
      modelId: 'm',
      userData: USER_DATA,
      inheritedEnv: { ...INHERITED, ANTHROPIC_API_KEY: 'sk-ant-SOMEONE-ELSES', ANTHROPIC_BASE_URL: 'https://stale.example' },
    });

    expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-real');
    // Load-bearing: an ANTHROPIC_BASE_URL exported in the shell that launched the app
    // would otherwise silently redirect this provider's traffic.
    expect('ANTHROPIC_BASE_URL' in env).toBe(false);
  });

  test('an inherited model pin from the developer own shell cannot outrank the chosen model', () => {
    const env = buildSessionEnv({
      provider: anthropic,
      modelId: 'claude-opus-4-8',
      userData: USER_DATA,
      inheritedEnv: { ...INHERITED, ANTHROPIC_MODEL: 'claude-3-haiku', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-3-haiku' },
    });

    expect(env['ANTHROPIC_MODEL']).toBe('claude-opus-4-8');
    expect(env['ANTHROPIC_DEFAULT_HAIKU_MODEL']).toBe('claude-opus-4-8');
  });
});
