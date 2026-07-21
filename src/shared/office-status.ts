/*
 * Turns the CLI's `scopes-check --output json` output into a status the UI can show.
 *
 * scopes-check decodes the cached Graph token locally (no network), so this is a cheap,
 * side-effect-free probe. The envelope is the CLI's usual `{ok, data}` shape: `ok:true`
 * with `data.scopes` and `data.expiresAt` when a token is cached, `{ok:false, error}`
 * when it is not. Process output is untrusted input, so this parser is the checkpoint:
 * it never assumes a field is present or well typed.
 */
// One of the extra tokens the CLI caches beside the basic one. The elevated tier is
// the interesting one: it carries no refresh token of its own, so it can only come
// back from a browser sign-in, and it expires while everything else still works.
export type TokenTier = {
  readonly available: boolean;
  readonly expiresInSeconds?: number;
  readonly scopes: readonly string[];
  readonly refresh: 'automatic' | 'interactive';
  // Present only when the tier is unavailable: a plain-language note on why.
  readonly reason?: string;
};

export type OfficeTiers = {
  readonly elevated?: TokenTier;
  readonly chatsvcagg?: TokenTier;
  readonly ic3?: TokenTier;
};

export type OfficeStatus =
  | {
      readonly signedIn: true;
      readonly scopes: readonly string[];
      readonly expiresAt: string;
      readonly expiresInSeconds?: number;
      // Empty when the CLI predates the tier blocks. Absent tiers are unknown, not
      // broken, so the health dot treats them as fine.
      readonly tiers: OfficeTiers;
    }
  | { readonly signedIn: false; readonly message: string };

// No Array.isArray guard: this module only reads named fields (`ok`, `error`, `data`,
// `scopes`, `expiresAt`), and an array has none of them, so it falls through to the
// same signed-out / empty-scopes result either way. Excluding arrays would be an
// unobservable branch (an equivalent mutant), so it is left out on purpose.
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const signedOutMessage = (parsed: unknown, raw: string): string => {
  if (isRecord(parsed) && typeof parsed['error'] === 'string' && parsed['error'].length > 0) return parsed['error'];
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : 'not signed in';
};

const stringsOf = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : []);

const numberOr = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

// A tier block, or nothing. `available` is the only field this insists on: without it
// there is no claim being made, and inventing one would either raise a false alarm or
// hide a real one.
const parseTier = (value: unknown): TokenTier | undefined => {
  if (!isRecord(value) || typeof value['available'] !== 'boolean') return undefined;
  const expiresInSeconds = numberOr(value['expiresInSeconds']);
  const reason = typeof value['reason'] === 'string' ? value['reason'] : undefined;
  return {
    available: value['available'],
    ...(expiresInSeconds === undefined ? {} : { expiresInSeconds }),
    scopes: stringsOf(value['scopes']),
    // Only the exact word counts; anything else is the self-healing kind, which is
    // the safe assumption because it needs no action from the user.
    refresh: value['refresh'] === 'interactive' ? 'interactive' : 'automatic',
    ...(reason === undefined ? {} : { reason }),
  };
};

const parseTiers = (data: Record<string, unknown>): OfficeTiers => {
  const elevated = parseTier(data['elevated']);
  const chatsvcagg = parseTier(data['chatsvcagg']);
  const ic3 = parseTier(data['ic3']);
  return {
    ...(elevated === undefined ? {} : { elevated }),
    ...(chatsvcagg === undefined ? {} : { chatsvcagg }),
    ...(ic3 === undefined ? {} : { ic3 }),
  };
};

export const parseScopesCheck = (stdout: string): OfficeStatus => {
  const parsed = parseJson(stdout);
  if (!isRecord(parsed) || parsed['ok'] !== true) return { signedIn: false, message: signedOutMessage(parsed, stdout) };

  const data = parsed['data'];
  if (!isRecord(data)) return { signedIn: true, scopes: [], expiresAt: '', tiers: {} };

  const expiresInSeconds = numberOr(data['expiresInSeconds']);
  return {
    signedIn: true,
    scopes: stringsOf(data['scopes']),
    expiresAt: typeof data['expiresAt'] === 'string' ? data['expiresAt'] : '',
    ...(expiresInSeconds === undefined ? {} : { expiresInSeconds }),
    tiers: parseTiers(data),
  };
};
