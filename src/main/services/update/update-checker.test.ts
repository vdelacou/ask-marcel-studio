import { describe, expect, test } from 'bun:test';
import { createUpdateChecker } from './update-checker.ts';
import type { UpdateFetch } from './update-checker.ts';

const release = (tag: string): string =>
  JSON.stringify({
    tag_name: tag,
    html_url: `https://github.com/vdelacou/ask-marcel-studio/releases/tag/${tag}`,
    assets: [{ name: 'Ask-Marcel-Studio.dmg', browser_download_url: `https://github.com/vdelacou/ask-marcel-studio/releases/download/${tag}/app.dmg` }],
  });

const okFetch =
  (body: string): UpdateFetch =>
  () =>
    Promise.resolve(new Response(body, { status: 200 }));

describe('checking for a newer release', () => {
  test('before any refresh, the status is the running version and no update', () => {
    const checker = createUpdateChecker({ fetch: okFetch(release('v0.1.0')), repo: 'vdelacou/ask-marcel-studio', currentVersion: '0.1.0', timeoutMs: 10_000 });

    expect(checker.current()).toEqual({ current: '0.1.0', updateAvailable: false });
  });

  test('a newer release becomes available, with its dmg', async () => {
    const checker = createUpdateChecker({ fetch: okFetch(release('v0.2.0')), repo: 'vdelacou/ask-marcel-studio', currentVersion: '0.1.0', timeoutMs: 10_000 });

    const status = await checker.refresh();

    expect(status.updateAvailable).toBe(true);
    expect(status.latest).toBe('0.2.0');
    expect(status.downloadUrl).toContain('app.dmg');
    expect(checker.current()).toEqual(status);
  });

  test('the same release is not an update', async () => {
    const checker = createUpdateChecker({ fetch: okFetch(release('v0.1.0')), repo: 'r', currentVersion: '0.1.0', timeoutMs: 10_000 });

    expect((await checker.refresh()).updateAvailable).toBe(false);
  });
});

describe('degrading silently on failure', () => {
  test('a non-200 response leaves the cached status untouched', async () => {
    const failing: UpdateFetch = () => Promise.resolve(new Response('nope', { status: 500 }));
    const checker = createUpdateChecker({ fetch: failing, repo: 'r', currentVersion: '0.1.0', timeoutMs: 10_000 });

    expect(await checker.refresh()).toEqual({ current: '0.1.0', updateAvailable: false });
  });

  test('a thrown network error is swallowed, not propagated', async () => {
    const throwing: UpdateFetch = () => Promise.reject(new Error('offline'));
    const checker = createUpdateChecker({ fetch: throwing, repo: 'r', currentVersion: '0.1.0', timeoutMs: 10_000 });

    expect(await checker.refresh()).toEqual({ current: '0.1.0', updateAvailable: false });
  });

  test('malformed json is swallowed', async () => {
    const garbage: UpdateFetch = () => Promise.resolve(new Response('{not json', { status: 200 }));
    const checker = createUpdateChecker({ fetch: garbage, repo: 'r', currentVersion: '0.1.0', timeoutMs: 10_000 });

    expect((await checker.refresh()).updateAvailable).toBe(false);
  });
});
