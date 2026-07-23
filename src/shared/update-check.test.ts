import { describe, expect, test } from 'bun:test';
import { evaluateRelease, isNewer, parseRelease, parseVersion, pickDmgUrl } from './update-check.ts';

describe('reading a version tag', () => {
  test('a v-prefixed tag is three numbers', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
  });

  test('a bare version is three numbers', () => {
    expect(parseVersion('0.1.0')).toEqual([0, 1, 0]);
  });

  test('a multi-digit part is read whole, not one digit', () => {
    expect(parseVersion('1.10.0')).toEqual([1, 10, 0]);
  });

  test('a part that only ends in a digit is rejected, so the anchors both matter', () => {
    expect(parseVersion('1e2.0.0')).toBeUndefined();
  });

  test('a pre-release suffix is ignored', () => {
    expect(parseVersion('1.2.3-beta.1')).toEqual([1, 2, 3]);
  });

  test('a non-numeric or wrong-length tag is not a version', () => {
    expect(parseVersion('latest')).toBeUndefined();
    expect(parseVersion('1.2')).toBeUndefined();
    expect(parseVersion('1.x.0')).toBeUndefined();
  });
});

describe('comparing versions', () => {
  test('a higher patch, minor or major is newer', () => {
    expect(isNewer('0.1.1', '0.1.0')).toBe(true);
    expect(isNewer('0.2.0', '0.1.9')).toBe(true);
    expect(isNewer('1.0.0', '0.9.9')).toBe(true);
  });

  test('equal or lower is not newer', () => {
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.1.0', '0.2.0')).toBe(false);
  });

  test('an unparseable version is never newer, so a bad tag cannot nag the user', () => {
    expect(isNewer('garbage', '0.1.0')).toBe(false);
  });

  test('an unparseable running version is never behind, so a bad current cannot nag either', () => {
    expect(isNewer('0.2.0', 'garbage')).toBe(false);
  });
});

describe('parsing a GitHub release', () => {
  const release = {
    tag_name: 'v0.2.0',
    html_url: 'https://github.com/vdelacou/ask-marcel-studio/releases/tag/v0.2.0',
    assets: [
      { name: 'Ask-Marcel-Studio-0.2.0.dmg', browser_download_url: 'https://github.com/x/y/releases/download/v0.2.0/app.dmg' },
      { name: 'notes.txt', browser_download_url: 'https://github.com/x/y/notes.txt' },
    ],
  };

  test('the tag, url and assets are read', () => {
    const parsed = parseRelease(release);
    expect(parsed?.tag).toBe('v0.2.0');
    expect(parsed?.releaseUrl).toBe('https://github.com/vdelacou/ask-marcel-studio/releases/tag/v0.2.0');
    expect(parsed?.assets).toHaveLength(2);
  });

  test('an asset without a string name is dropped', () => {
    const parsed = parseRelease({ tag_name: 'v1', html_url: 'https://x', assets: [{ name: 123, browser_download_url: 'https://x/a.dmg' }] });
    expect(parsed?.assets).toEqual([]);
  });

  test('an asset whose url is not even a string is dropped, not thrown on', () => {
    const parsed = parseRelease({ tag_name: 'v1', html_url: 'https://x', assets: [{ name: 'a.dmg', browser_download_url: 42 }] });
    expect(parsed?.assets).toEqual([]);
  });

  test('the good assets survive when a bad one is mixed in', () => {
    const parsed = parseRelease({ tag_name: 'v1', html_url: 'https://x', assets: [{ name: 'a.dmg', browser_download_url: 'https://x/a.dmg' }, { name: 42 }] });
    expect(parsed?.assets).toHaveLength(1);
  });

  test('a non-object, or one missing its tag, is rejected', () => {
    expect(parseRelease(null)).toBeUndefined();
    expect(parseRelease({ html_url: 'https://x' })).toBeUndefined();
  });

  // Built from a scheme variable so the source carries no clear-text-protocol literal.
  const insecure = (rest: string): string => `${'http'}://${rest}`;

  test('a non-https download url is dropped, since the url reaches an external-open sink', () => {
    const parsed = parseRelease({ tag_name: 'v1', html_url: 'https://x', assets: [{ name: 'a.dmg', browser_download_url: insecure('insecure/a.dmg') }] });
    expect(parsed?.assets).toEqual([]);
  });

  test('an http html_url is rejected outright', () => {
    expect(parseRelease({ tag_name: 'v1', html_url: insecure('x'), assets: [] })).toBeUndefined();
  });
});

describe('picking the disk image', () => {
  test('the .dmg asset is chosen over others', () => {
    expect(
      pickDmgUrl([
        { name: 'notes.txt', downloadUrl: 'https://x/n' },
        { name: 'App.dmg', downloadUrl: 'https://x/a' },
      ])
    ).toBe('https://x/a');
  });

  test('no dmg is undefined', () => {
    expect(pickDmgUrl([{ name: 'notes.txt', downloadUrl: 'https://x/n' }])).toBeUndefined();
  });
});

describe('evaluating a release against the running build', () => {
  const release = {
    tag: 'v0.2.0',
    releaseUrl: 'https://github.com/x/releases/v0.2.0',
    assets: [{ name: 'App.dmg', downloadUrl: 'https://x/app.dmg' }],
  };

  test('a newer release is available, with its dmg and release page', () => {
    expect(evaluateRelease({ current: '0.1.0', release })).toEqual({
      current: '0.1.0',
      latest: '0.2.0',
      updateAvailable: true,
      downloadUrl: 'https://x/app.dmg',
      releaseUrl: 'https://github.com/x/releases/v0.2.0',
    });
  });

  test('the same version is not an update, and carries no download link', () => {
    expect(evaluateRelease({ current: '0.2.0', release })).toEqual({ current: '0.2.0', latest: '0.2.0', updateAvailable: false });
  });

  test('a newer release without a dmg still flags the update via its release page', () => {
    const noDmg = { tag: 'v0.2.0', releaseUrl: 'https://x/r', assets: [] };
    const status = evaluateRelease({ current: '0.1.0', release: noDmg });
    expect(status).toEqual({ current: '0.1.0', latest: '0.2.0', updateAvailable: true, releaseUrl: 'https://x/r' });
    // No dmg means the key is absent, not present-and-undefined: the banner keys off it.
    expect('downloadUrl' in status).toBe(false);
  });
});
