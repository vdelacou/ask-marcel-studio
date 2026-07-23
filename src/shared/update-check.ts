/*
 * Deciding whether a newer build exists, from a GitHub release.
 *
 * The app is unsigned, so it cannot silently self-update (macOS refuses an unsigned
 * autoupdate). The most it can honestly do is notice a newer release and point the user at
 * the DMG. This is the pure half: parse the release the API returned, compare its version to
 * the running one, and pick the DMG to link. The fetch and the schedule are the checker's.
 *
 * The release JSON crosses a trust boundary (the network), so parseRelease validates it
 * before anything downstream trusts a field, and only https URLs survive: the URL reaches
 * shell.openExternal, a dangerous sink (rule 12).
 */

// The status the renderer renders: always the running version, plus a newer one and where to
// get it when the check found one. Never a failure shape: a check that could not run just
// leaves updateAvailable false, which reads as "you are up to date" and is the safe default.
export type UpdateStatus = {
  readonly current: string;
  readonly latest?: string;
  readonly downloadUrl?: string;
  readonly releaseUrl?: string;
  readonly updateAvailable: boolean;
};

// The slice of the GitHub release we read. The API returns far more; these are the fields the
// decision uses.
export type ReleaseAsset = { readonly name: string; readonly downloadUrl: string };
export type Release = { readonly tag: string; readonly releaseUrl: string; readonly assets: readonly ReleaseAsset[] };

const isHttps = (value: unknown): value is string => typeof value === 'string' && value.startsWith('https://');

const asRecord = (value: unknown): Record<string, unknown> | undefined => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined);

const parseAsset = (value: unknown): ReleaseAsset | undefined => {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  if (typeof record['name'] !== 'string' || !isHttps(record['browser_download_url'])) return undefined;
  return { name: record['name'], downloadUrl: record['browser_download_url'] };
};

// Validate the API response into a Release, or undefined if it is not the shape we expect.
// The GitHub /releases/latest endpoint returns tag_name, html_url and assets[].
export const parseRelease = (value: unknown): Release | undefined => {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  if (typeof record['tag_name'] !== 'string' || !isHttps(record['html_url'])) return undefined;
  const rawAssets = Array.isArray(record['assets']) ? record['assets'] : [];
  const assets = rawAssets.map(parseAsset).filter((asset): asset is ReleaseAsset => asset !== undefined);
  return { tag: record['tag_name'], releaseUrl: record['html_url'], assets };
};

// A "v1.2.3" or "1.2.3" tag as its three numbers, or undefined if it is not three numbers.
// Any pre-release suffix (the "-beta" in "1.2.3-beta") is ignored: only the release triple
// decides ordering here.
export const parseVersion = (raw: string): readonly [number, number, number] | undefined => {
  const core = raw.replace(/^v/i, '').split('-')[0] ?? '';
  const parts = core.split('.');
  if (parts.length !== 3) return undefined;
  const numbers = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
  if (numbers.some(Number.isNaN)) return undefined;
  return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0];
};

// True when latest is strictly higher than current, comparing major, then minor, then patch.
export const isNewer = (latest: string, current: string): boolean => {
  const left = parseVersion(latest);
  const right = parseVersion(current);
  if (left === undefined || right === undefined) return false;
  for (let index = 0; index < 3; index++) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
};

// The macOS disk image to link, if the release carries one.
export const pickDmgUrl = (assets: readonly ReleaseAsset[]): string | undefined => assets.find((asset) => asset.name.toLowerCase().endsWith('.dmg'))?.downloadUrl;

// Fold the running version and the parsed release into what the UI shows. A release older
// than or equal to the running build, or one we could not parse, is simply "up to date".
export const evaluateRelease = (input: { readonly current: string; readonly release: Release }): UpdateStatus => {
  const latest = input.release.tag.replace(/^v/i, '');
  if (!isNewer(input.release.tag, input.current)) return { current: input.current, latest, updateAvailable: false };
  const downloadUrl = pickDmgUrl(input.release.assets);
  return {
    current: input.current,
    latest,
    updateAvailable: true,
    releaseUrl: input.release.releaseUrl,
    ...(downloadUrl === undefined ? {} : { downloadUrl }),
  };
};
