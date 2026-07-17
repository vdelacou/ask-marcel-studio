/*
 * The environment handed to the agent subprocess, built from scratch each turn.
 *
 * Pure and unit-tested because it is the one place several security-relevant
 * decisions land at once: which key the agent authenticates with, which endpoint
 * it talks to, which model every call uses, and what resolves first on PATH.
 *
 * The inherited environment is data, not authority. Whatever the developer has
 * exported (ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL) is overwritten
 * by the provider's own values: an inherited var silently redirecting a turn to the
 * wrong endpoint or the wrong key is exactly the bug this ordering prevents.
 *
 * M2 handles the anthropic provider only. The openai branch (pointing the agent at
 * the local gateway) lands with the gateway itself in M5.
 */
import { binDir, claudeConfigDir } from './paths.ts';
import type { Provider } from './types.ts';

export type SessionEnvInput = {
  readonly provider: Provider;
  // The bare model id, not the 'providerId::modelId' reference.
  readonly modelId: string;
  readonly userData: string;
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>;
};

// The SDK appends /v1/messages itself, so a base url ending in /v1 would become
// /v1/v1/messages. Users paste the url straight from a provider's docs, where it
// routinely carries the /v1.
//
// Written without a regex on purpose: /\/+$/ is the classic (a+)$ backtracking
// shape and trips sonarjs/super-linear-regex. A loop is linear and reads better.
const V1_SUFFIX = '/v1';
const normaliseBaseUrl = (raw: string): string => {
  let url = raw;
  while (url.endsWith('/')) url = url.slice(0, -1);
  if (url.endsWith(V1_SUFFIX)) url = url.slice(0, -V1_SUFFIX.length);
  return url;
};

const withoutUndefined = (env: Readonly<Record<string, string | undefined>>): Record<string, string> => {
  const copy: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) copy[key] = value;
  }
  return copy;
};

export const buildSessionEnv = (input: SessionEnvInput): Record<string, string> => {
  // Copy first: process.env is shared mutable state and must never be written to.
  const env = withoutUndefined(input.inheritedEnv);
  const inheritedPath = env['PATH'];

  env['CLAUDE_CONFIG_DIR'] = claudeConfigDir(input.userData);
  // Prepended, not replaced: the agent still needs git, node and the rest.
  env['PATH'] = inheritedPath === undefined ? binDir(input.userData) : `${binDir(input.userData)}:${inheritedPath}`;
  env['NO_UPDATE_NOTIFIER'] = '1';

  env['ANTHROPIC_API_KEY'] = input.provider.apiKey;

  const baseUrl = input.provider.baseUrl;
  if (baseUrl === undefined || baseUrl.length === 0) {
    // No provider base url means the real Anthropic API. An inherited one would
    // silently redirect the traffic, so it is removed rather than left in place.
    delete env['ANTHROPIC_BASE_URL'];
  } else {
    env['ANTHROPIC_BASE_URL'] = normaliseBaseUrl(baseUrl);
  }

  // All four pinned to the chosen model. The agent makes background calls (titles,
  // summaries, fast paths) that would otherwise quietly bill a different model on
  // the user's key.
  env['ANTHROPIC_MODEL'] = input.modelId;
  env['ANTHROPIC_DEFAULT_OPUS_MODEL'] = input.modelId;
  env['ANTHROPIC_DEFAULT_SONNET_MODEL'] = input.modelId;
  env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] = input.modelId;

  return env;
};
