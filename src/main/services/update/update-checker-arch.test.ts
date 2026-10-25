import { describe, expect, test } from 'bun:test';
import { createUpdateChecker } from './update-checker.ts';
import type { UpdateFetch } from './update-checker.ts';

const BASE = 'https://github.com/vdelacou/ask-marcel-studio/releases/download/v0.2.0';

const twoImages: UpdateFetch = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/vdelacou/ask-marcel-studio/releases/tag/v0.2.0',
        assets: [
          { name: 'Ask Marcel Studio-0.2.0-x64.dmg', browser_download_url: `${BASE}/intel.dmg` },
          { name: 'Ask Marcel Studio-0.2.0-arm64.dmg', browser_download_url: `${BASE}/silicon.dmg` },
        ],
      }),
      { status: 200 }
    )
  );

describe('offering the build for the Mac the app runs on', () => {
  test('an Apple Silicon Mac is offered the arm64 image of a newer release', async () => {
    const checker = createUpdateChecker({ fetch: twoImages, repo: 'vdelacou/ask-marcel-studio', currentVersion: '0.1.0', timeoutMs: 10_000, arch: 'arm64' });

    expect((await checker.refresh()).downloadUrl).toBe(`${BASE}/silicon.dmg`);
  });
});
