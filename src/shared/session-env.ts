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

type GatewayAddress = { readonly baseUrl: string; readonly apiKey: string };

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
  // openai provider; ignored for anthropic and claude-plan, which talk to the real API.
  readonly gateway?: GatewayAddress;
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

// Everything Claude Code would use ahead of a Claude plan sign-in, or that would carry the
// plan's token to another address. A key exported in the shell that launched the app would
// otherwise quietly bill every turn to it, with the plan sitting unused.
const PLAN_OVERRIDES: ReadonlySet<string> = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
]);

const withoutPlanOverrides = (env: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !PLAN_OVERRIDES.has(name)));

export type SignInEnvInput = {
  // The account whose claude-config the agent's turns use.
  readonly configRoot: string;
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>;
};

// Where `claude auth status` and `claude auth login` run. Claude Code names its keychain item
// after CLAUDE_CONFIG_DIR, so this has to be the folder a turn is given, or a sign-in would
// land where no turn ever looks.
export const buildSignInEnv = (input: SignInEnvInput): Record<string, string> => ({
  ...withoutPlanOverrides(withoutUndefined(input.inheritedEnv)),
  CLAUDE_CONFIG_DIR: claudeConfigDir(input.configRoot),
});

// Which key and address the agent authenticates with. An openai provider never sees its own
// key or endpoint: the agent talks to the gateway, and the gateway holds the real
// credentials. A plan provider has neither to give: Claude Code finds its own sign-in under
// CLAUDE_CONFIG_DIR, and everything that could outrank it is already gone.
const applyCredentials = (env: Record<string, string>, provider: Provider, gateway: GatewayAddress | undefined): void => {
  if (gateway !== undefined) {
    env['ANTHROPIC_BASE_URL'] = gateway.baseUrl;
    env['ANTHROPIC_API_KEY'] = gateway.apiKey;
    return;
  }
  if (provider.kind === 'claude-plan') return;
  env['ANTHROPIC_API_KEY'] = provider.apiKey;
  // No provider base url means the real Anthropic API. An inherited one would silently
  // redirect the traffic, so it is removed rather than left in place.
  if (provider.baseUrl === undefined || provider.baseUrl.length === 0) {
    delete env['ANTHROPIC_BASE_URL'];
    return;
  }
  env['ANTHROPIC_BASE_URL'] = normaliseBaseUrl(provider.baseUrl);
};

export const buildSessionEnv = (input: SessionEnvInput): Record<string, string> => {
  // Copy first: process.env is shared mutable state and must never be written to. A plan
  // turn's copy leaves out everything that would outrank its sign-in.
  const inherited = withoutUndefined(input.inheritedEnv);
  const env = input.provider.kind === 'claude-plan' ? withoutPlanOverrides(inherited) : inherited;
  const inheritedPath = env['PATH'];

  env['CLAUDE_CONFIG_DIR'] = claudeConfigDir(input.configRoot);
  // Prepended, not replaced: the agent still needs git and the rest. The separator is the
  // OS delimiter (':' on unix, ';' on Windows), so the shim resolves first on either.
  const pathSeparator = input.pathDelimiter ?? delimiter;
  env['PATH'] = inheritedPath === undefined ? binDir(input.toolsRoot) : `${binDir(input.toolsRoot)}${pathSeparator}${inheritedPath}`;
  env['NO_UPDATE_NOTIFIER'] = '1';

  // Only an openai provider goes through the gateway. The model reference then keeps its
  // providerId so the gateway knows which upstream to call.
  // Narrowed once into a local: `viaGateway && input.gateway !== undefined` reads as a
  // redundant second check, because a boolean const does not narrow the property.
  const gateway = input.provider.kind === 'openai' ? input.gateway : undefined;
  applyCredentials(env, input.provider, gateway);

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
