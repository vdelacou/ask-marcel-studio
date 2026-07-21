/*
 * Asking a provider whether a key and a model name actually work.
 *
 * The request is built to land on exactly the endpoint a real turn would use: an
 * Anthropic provider gets POST <base>/v1/messages with the version header the API
 * requires, and an OpenAI-compatible one gets POST <base>/chat/completions, which is
 * what the gateway's AI SDK client calls at runtime. Testing a different path would
 * prove the wrong thing.
 *
 * One token is asked for, because the point is to be told yes or no, not to be
 * answered. What comes back is never read: the HTTP status carries everything worth
 * saying, and the provider's own error json is written for whoever built the provider,
 * not for the person reading this screen.
 *
 * Pure: builds a request and reads a status. The call itself belongs to the service.
 */
import { normaliseBaseUrl } from './session-env.ts';

export type ModelTestTarget = {
  readonly kind: 'anthropic' | 'openai';
  // Absent or empty means the real Anthropic API; an openai provider must have one.
  readonly baseUrl?: string;
  readonly apiKey: string;
  readonly modelId: string;
};

export type ModelTestRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
};

export type ModelTestOutcome = 'works' | 'key-refused' | 'model-unknown' | 'busy' | 'provider-error' | 'unreachable';

export type ModelTestVerdict = { readonly outcome: ModelTestOutcome; readonly message: string };

// The real API when no base url is set, the same default the session environment uses.
export const ANTHROPIC_API = 'https://api.anthropic.com';

// The date is the API's own versioning scheme, not ours, and it is required on every
// Anthropic request.
export const ANTHROPIC_VERSION = '2023-06-01';

// One token: enough to prove the key, the address and the model name all work, cheap
// enough to press repeatedly.
const MAX_TOKENS = 1;

const PROMPT = 'ping';

const withoutTrailingSlashes = (raw: string): string => {
  let url = raw.trim();
  while (url.endsWith('/')) url = url.slice(0, -1);
  return url;
};

export const buildModelTestRequest = (target: ModelTestTarget): ModelTestRequest => {
  const body = JSON.stringify({ model: target.modelId, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: PROMPT }] });
  const base = target.baseUrl === undefined ? '' : target.baseUrl.trim();

  if (target.kind === 'anthropic') {
    return {
      // normaliseBaseUrl, so a url pasted with the /v1 already on it does not become
      // /v1/v1/messages. Exactly what the agent's own environment does with it.
      url: `${base.length === 0 ? ANTHROPIC_API : normaliseBaseUrl(base)}/v1/messages`,
      headers: { 'content-type': 'application/json', 'x-api-key': target.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      body,
    };
  }

  return {
    // The base url is used as given (only trailing slashes go), because that is what
    // the gateway hands to the AI SDK, and these endpoints disagree about /v1.
    url: `${withoutTrailingSlashes(base)}/chat/completions`,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${target.apiKey}` },
    body,
  };
};

// What is missing before there is anything to test, said as the answer rather than as
// an error: the panel shows it in the same place as a real verdict.
export const checkTarget = (target: ModelTestTarget): ModelTestVerdict | undefined => {
  if (target.modelId.trim().length === 0) return { outcome: 'model-unknown', message: 'Give the model a name first.' };
  if (target.apiKey.trim().length === 0) return { outcome: 'key-refused', message: 'Add the key first.' };
  if (target.kind === 'openai' && (target.baseUrl ?? '').trim().length === 0) return { outcome: 'unreachable', message: 'An OpenAI-compatible provider needs its address first.' };
  return undefined;
};

// The checkpoint at the trust boundary: what arrives over IPC is a renderer object,
// not a target. Anything unreadable becomes an empty string, which checkTarget then
// names ("add the key first") rather than the app inventing a failure for it.
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

export const parseModelTestTarget = (input: unknown): ModelTestTarget => {
  const record: Record<string, unknown> = typeof input === 'object' && input !== null ? { ...input } : {};
  return {
    kind: record['kind'] === 'openai' ? 'openai' : 'anthropic',
    baseUrl: textOf(record['baseUrl']),
    apiKey: textOf(record['apiKey']),
    modelId: textOf(record['modelId']),
  };
};

export const UNREACHABLE: ModelTestVerdict = { outcome: 'unreachable', message: 'Could not reach that address. Check it, and check you are online.' };

export const TOO_SLOW: ModelTestVerdict = { outcome: 'unreachable', message: 'That address did not answer in time.' };

// The status is the whole answer. 401 and 403 are both the key: one says it is not a
// key, the other says it is not a key for this. 400 joins 404 because an OpenAI-
// compatible endpoint refuses an unknown model name either way, and the request itself
// is fixed here, so it is not the thing at fault.
export const verdictForStatus = (status: number): ModelTestVerdict => {
  if (status >= 200 && status < 300) return { outcome: 'works', message: 'Works. The model answered.' };
  if (status === 401 || status === 403) return { outcome: 'key-refused', message: 'The key was refused. Check it is complete and still valid.' };
  if (status === 400 || status === 404) return { outcome: 'model-unknown', message: 'That model name was not recognised at this address.' };
  if (status === 429) return { outcome: 'busy', message: 'The provider is busy right now. Try again in a moment.' };
  return { outcome: 'provider-error', message: `The provider answered with an error (${String(status)}).` };
};
