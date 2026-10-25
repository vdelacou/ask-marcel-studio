/*
 * A release carries one disk image per Mac architecture. The update notice links the one
 * this Mac can run: an Apple Silicon Mac offered the Intel build would run it translated at
 * best, and an Intel Mac offered the Apple Silicon build cannot open it at all.
 */
import { describe, expect, test } from 'bun:test';
import { evaluateRelease, pickDmgUrl } from './update-check.ts';
import type { ReleaseAsset } from './update-check.ts';

const INTEL: ReleaseAsset = { name: 'Ask Marcel Studio-0.2.0-x64.dmg', downloadUrl: 'https://example.test/x64.dmg' };
const SILICON: ReleaseAsset = { name: 'Ask Marcel Studio-0.2.0-arm64.dmg', downloadUrl: 'https://example.test/arm64.dmg' };
const OLD_STYLE: ReleaseAsset = { name: 'Ask Marcel Studio-0.1.0.dmg', downloadUrl: 'https://example.test/old.dmg' };
const NOTES: ReleaseAsset = { name: 'notes.txt', downloadUrl: 'https://example.test/notes.txt' };

describe('linking the disk image this Mac can run', () => {
  test('an Apple Silicon Mac gets the arm64 image, whatever order the release lists them in', () => {
    expect(pickDmgUrl([INTEL, SILICON], 'arm64')).toBe(SILICON.downloadUrl);
  });

  test('an Intel Mac gets the x64 image', () => {
    expect(pickDmgUrl([SILICON, INTEL], 'x64')).toBe(INTEL.downloadUrl);
  });

  test('a release from before the images were named by architecture still links its one image', () => {
    expect(pickDmgUrl([NOTES, OLD_STYLE], 'arm64')).toBe(OLD_STYLE.downloadUrl);
  });

  test('an image built for the other architecture is never offered', () => {
    expect(pickDmgUrl([SILICON], 'x64')).toBeUndefined();
  });

  test('a name that only mentions an architecture elsewhere is not mistaken for one', () => {
    const misleading: ReleaseAsset = { name: 'arm64-notes.dmg', downloadUrl: 'https://example.test/misleading.dmg' };

    expect(pickDmgUrl([misleading], 'x64')).toBe(misleading.downloadUrl);
  });

  test('the update notice carries the image for the Mac it runs on', () => {
    const release = { tag: 'v0.2.0', releaseUrl: 'https://example.test/release', assets: [INTEL, SILICON] };

    expect(evaluateRelease({ current: '0.1.0', release, arch: 'arm64' }).downloadUrl).toBe(SILICON.downloadUrl);
  });
});
