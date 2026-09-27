/*
 * Who is signed in to Claude Code, read from `claude auth status --json`.
 *
 * The app never handles a Claude sign-in itself. Claude Code runs Anthropic's own browser
 * flow and keeps the token in its own store (on macOS a keychain item named after a hash of
 * CLAUDE_CONFIG_DIR), which is what Anthropic's terms require of an app built on it. All the
 * app ever reads is this status, and the status carries no secret.
 *
 * Process output is untrusted input, so this parser is the checkpoint: it assumes no field
 * is present or well typed. Pure: it reads text and names a file, the service spawns.
 */
import type { Result } from './result.ts';
import type { ProviderKind } from './types.ts';
import { err, ok } from './result.ts';

export type ClaudePlanStatus = { readonly signedIn: false } | { readonly signedIn: true; readonly email?: string; readonly plan?: string };

// One model Claude Code offers the plan, as its `supportedModels()` lists it. The id is what a
// turn asks for, usually an alias Claude Code resolves itself (`sonnet`, `opus[1m]`).
export type PlanModel = { readonly id: string; readonly label: string; readonly description: string };

// What `auth status` calls a sign-in made on claude.ai. An api key, a token handed in
// through the environment and a cloud provider all report `loggedIn: true` as well, and
// none of them is the plan.
const PLAN_SIGN_IN = 'claude.ai';

// The package the SDK installs its native Claude Code from, one per platform. Resolved the
// way the SDK resolves it, so signing in runs the very binary the agent's turns run.
const BINARY_PACKAGE = '@anthropic-ai/claude-agent-sdk';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

// Claude Code writes null for a detail it does not have.
const detail = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export const parseClaudeAuthStatus = (stdout: string): Result<ClaudePlanStatus, string> => {
  const status = parseJson(stdout);
  if (!isRecord(status) || typeof status['loggedIn'] !== 'boolean') return err('Claude Code did not report its sign-in status');
  if (!status['loggedIn'] || status['authMethod'] !== PLAN_SIGN_IN) return ok({ signedIn: false });

  const email = detail(status['email']);
  const plan = detail(status['subscriptionType']);
  return ok({ signedIn: true, ...(email === undefined ? {} : { email }), ...(plan === undefined ? {} : { plan }) });
};

// Claude Code's picker entry for "no model set". Sent as a model it goes out literally and is
// refused (probed 2026-09-27), and every turn here names a model, so it is never offered.
const NO_MODEL_SET = 'default';

const planModel = (entry: unknown): PlanModel | undefined => {
  if (!isRecord(entry)) return undefined;
  const id = detail(entry['value']);
  if (id === undefined || id.length === 0 || id === NO_MODEL_SET) return undefined;
  return { id, label: detail(entry['displayName']) ?? id, description: detail(entry['description']) ?? '' };
};

// The list crosses a process boundary, so it is read like any other untrusted output: an entry
// that names no model is skipped, and a list with nothing usable left is refused.
export const parsePlanModels = (raw: unknown): Result<readonly PlanModel[], string> => {
  if (!Array.isArray(raw)) return err('Claude Code did not list its models');
  const models = raw.map(planModel).filter((model): model is PlanModel => model !== undefined);
  return models.length > 0 ? ok(models) : err('Claude Code listed no model a turn could use');
};

// Every Anthropic model id starts with `claude-`; anything else a plan turn names (`sonnet`,
// `opus[1m]`, `haiku`) is one of Claude Code's aliases, which it resolves itself.
export const isClaudeCodeAlias = (modelId: string): boolean => !modelId.startsWith('claude-');

export const claudeCodeBinarySpecifier = (platform: string, arch: string): string => `${BINARY_PACKAGE}-${platform}-${arch}/claude${platform === 'win32' ? '.exe' : ''}`;

// What Claude Code says when a turn has no sign-in to run on. Its own advice, /login, names a
// command this app does not have, so a plan turn says where the sign-in actually is.
const NOT_SIGNED_IN = 'Not logged in';
const WHERE_TO_SIGN_IN = 'You’re not signed in to your Claude plan. Open Settings, then Models, and press Sign in with Claude.';

// Only a plan turn is rewritten: an api-key provider that somehow reports the same words has
// a key to fix, not a sign-in.
export const explainTurnError = (message: string, kind: ProviderKind): string => (kind === 'claude-plan' && message.includes(NOT_SIGNED_IN) ? WHERE_TO_SIGN_IN : message);
