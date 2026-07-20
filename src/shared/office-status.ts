/*
 * Turns the CLI's `scopes-check --output json` output into a status the UI can show.
 *
 * scopes-check decodes the cached Graph token locally (no network), so this is a cheap,
 * side-effect-free probe. The envelope is the CLI's usual `{ok, data}` shape: `ok:true`
 * with `data.scopes` and `data.expiresAt` when a token is cached, `{ok:false, error}`
 * when it is not. Process output is untrusted input, so this parser is the checkpoint:
 * it never assumes a field is present or well typed.
 */
export type OfficeStatus = { readonly signedIn: true; readonly scopes: readonly string[]; readonly expiresAt: string } | { readonly signedIn: false; readonly message: string };

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

export const parseScopesCheck = (stdout: string): OfficeStatus => {
  const parsed = parseJson(stdout);
  if (!isRecord(parsed) || parsed['ok'] !== true) return { signedIn: false, message: signedOutMessage(parsed, stdout) };

  const data = parsed['data'];
  const rawScopes = isRecord(data) ? data['scopes'] : undefined;
  const scopes = Array.isArray(rawScopes) ? rawScopes.filter((s): s is string => typeof s === 'string') : [];
  const expiresAt = isRecord(data) && typeof data['expiresAt'] === 'string' ? data['expiresAt'] : '';
  return { signedIn: true, scopes, expiresAt };
};
