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
 * An openai-compatible provider is pointed at the local gateway instead of the real
 * API: the agent speaks Anthropic to 127.0.0.1 and the gateway translates. The model
 * vars then carry the FULL 'providerId::modelId' reference, because the gateway needs
 * the providerId to know which upstream to call — the agent is just the courier.
 */
import { delimiter } from 'node:path';
import { binDir, claudeConfigDir } from './paths.ts';
import { formatModelRef } from './model-ref.ts';
import type { Provider } from './types.ts';

// node:path is path manipulation, not IO, so it is allowed anywhere (rule 20).

export type SessionEnvInput = {
  readonly provider: Provider;
  // The bare model id, not the 'providerId::modelId' reference.
  readonly modelId: string;
  // Where this account's claude-config lives: the skills, notes and per-user files the
  // agent reads. One account's must never be handed to another's session.
  readonly configRoot: string;
  // Where the shims live (node, npm, ask-marcel-office). Shared by every account: they are
  // the machine's tooling, not anybody's data.
  readonly toolsRoot: string;
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>;
  // Where the local gateway is listening, and its per-run key. Required for an
  // openai provider; ignored for anthropic, which talks to the real API.
  readonly gateway?: { readonly baseUrl: string; readonly apiKey: string };
  // Defaults to the OS path.delimiter (authoritative in the main process); injected in
  // tests to prove the Windows ';' join without a Windows box.
  readonly pathDelimiter?: string;
};

// The SDK appends /v1/messages itself, so a base url ending in /v1 would become
// /v1/v1/messages. Users paste the url straight from a provider's docs, where it
// routinely carries the /v1.
//
// Written without a regex on purpose: /\/+$/ is the classic (a+)$ backtracking
// shape and trips sonarjs/super-linear-regex. A loop is linear and reads better.
const V1_SUFFIX = '/v1';
// Exported so the model test hits the same address a real turn would: if these two
// disagreed about the /v1, a passing test would prove nothing.
export const normaliseBaseUrl = (raw: string): string => {
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

  env['CLAUDE_CONFIG_DIR'] = claudeConfigDir(input.configRoot);
  // Prepended, not replaced: the agent still needs git and the rest. The separator is the
  // OS delimiter (':' on unix, ';' on Windows), so the shim resolves first on either.
  const pathSeparator = input.pathDelimiter ?? delimiter;
  env['PATH'] = inheritedPath === undefined ? binDir(input.toolsRoot) : `${binDir(input.toolsRoot)}${pathSeparator}${inheritedPath}`;
  env['NO_UPDATE_NOTIFIER'] = '1';

  // An openai provider never sees its own key or endpoint: the agent talks to the
  // gateway, and the gateway holds the real credentials. The model reference keeps
  // its providerId so the gateway knows which upstream to call.
  // Narrowed once into a local: `viaGateway && input.gateway !== undefined` reads as a
  // redundant second check, because a boolean const does not narrow the property.
  const gateway = input.provider.kind === 'openai' ? input.gateway : undefined;
  if (gateway !== undefined) {
    env['ANTHROPIC_BASE_URL'] = gateway.baseUrl;
    env['ANTHROPIC_API_KEY'] = gateway.apiKey;
  } else {
    env['ANTHROPIC_API_KEY'] = input.provider.apiKey;
    const baseUrl = input.provider.baseUrl;
    if (baseUrl === undefined || baseUrl.length === 0) {
      // No provider base url means the real Anthropic API. An inherited one would
      // silently redirect the traffic, so it is removed rather than left in place.
      delete env['ANTHROPIC_BASE_URL'];
    } else {
      env['ANTHROPIC_BASE_URL'] = normaliseBaseUrl(baseUrl);
    }
  }

  // All four pinned to the same model. The agent makes background calls (titles,
  // summaries, fast paths) that would otherwise quietly bill a different model on
  // the user's key. Through the gateway that value is the full reference, since the
  // gateway routes on the providerId.
  const model = gateway === undefined ? input.modelId : formatModelRef({ providerId: input.provider.id, modelId: input.modelId });
  env['ANTHROPIC_MODEL'] = model;
  env['ANTHROPIC_DEFAULT_OPUS_MODEL'] = model;
  env['ANTHROPIC_DEFAULT_SONNET_MODEL'] = model;
  env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] = model;

  return env;
};
