/*
 * Which account a piece of data belongs to.
 *
 * Everything the app learns from Microsoft 365 belongs to the account it came from:
 * conversations, what the agent remembers, the signature, the workspaces. Signing out and
 * signing in as somebody else must open their world, not show them the last person's, and
 * signing back in must find the first one exactly as it was left.
 *
 * The key is derived from the directory id, not the address. Microsoft 365 promises not to
 * reuse an id; an address is reassigned to a new joiner often enough, and their mail must
 * never land in the leaver's folder. The address rides along in the name anyway, because a
 * folder called `a1b2c3d4` answers no question a person might have while looking at it.
 *
 * This value becomes a path segment, so it is a trust boundary (rule 12): the factory is
 * the only way to make one, and it can produce nothing that escapes the data folder.
 */
export type AccountKey = string & { readonly __brand: 'AccountKey' };

export type AccountIdentity = {
  readonly id: string;
  readonly email: string;
};

// Where the app works before anyone has signed in. Its data is adopted by the first
// account to sign in, which is what makes a first run followed by a first sign-in feel
// like one session rather than two.
export const PENDING_ACCOUNT = 'signed-out' as AccountKey;

const MAX_LABEL = 40;
const KEY_PATTERN = /^[a-z0-9-]+$/;

// Written as a loop rather than /^-+|-+$/: that shape is the classic super-linear
// backtracking pattern the linter rejects, and the same reasoning as session-env's
// trailing-slash trim applies here.
const trimDashes = (value: string): string => {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '-') start += 1;
  while (end > start && value[end - 1] === '-') end -= 1;
  return value.slice(start, end);
};

const slug = (value: string): string =>
  trimDashes(
    trimDashes(
      value
        .toLowerCase()
        .normalize('NFD')
        // Strip the accents NFD just split off, so Renée and Renee land in one folder
        // rather than two that look identical in a file listing.
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
    ).slice(0, MAX_LABEL)
  );

// A short, stable fingerprint of the id. Not a security boundary: it exists so two people
// who once held the same address get two folders, and it is short because the whole key
// becomes part of a path used by the SDK's own transcript directories.
const fingerprint = (id: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
};

export const accountKeyFor = (identity: AccountIdentity): AccountKey => {
  const label = slug(identity.email.split('@')[0] ?? '');
  const suffix = fingerprint(identity.id);
  return (label.length > 0 ? `${label}-${suffix}` : suffix) as AccountKey;
};

// Two keys are the same account when they end in the same fingerprint: the readable half
// is the address, which can change without the person changing.
export const isSameAccount = (one: AccountKey, other: AccountKey): boolean => one.split('-').at(-1) === other.split('-').at(-1);

// The folder to open for this identity. An address that changed since last time would
// otherwise mint a new, empty folder beside the full one, so an existing folder for the
// same person wins over the name their address suggests today.
export const resolveAccountKey = (existing: readonly AccountKey[], identity: AccountIdentity): AccountKey => {
  const wanted = accountKeyFor(identity);
  return existing.find((candidate) => candidate !== PENDING_ACCOUNT && isSameAccount(candidate, wanted)) ?? wanted;
};

// A key read back from disk or over IPC. Anything the factory would not have produced is
// refused rather than turned into a path.
export const parseAccountKey = (raw: unknown): AccountKey | undefined => {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 80) return undefined;
  return KEY_PATTERN.test(raw) ? (raw as AccountKey) : undefined;
};
