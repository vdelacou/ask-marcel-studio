#!/usr/bin/env bun
/*
 * Vendor an embedded CPython runtime (Astral python-build-standalone).
 *
 * Downloads the pinned `install_only` tarball for a target triple, verifies its SHA256
 * against the pin below, and extracts it into vendor/python/<triple>/ (git-ignored). The
 * tarball unpacks to a `python/` folder, matching src/shared/python-paths.ts. electron-
 * builder later ships the right triple per platform as extraResources (M6).
 *
 *   bun run scripts/fetch-python.ts            # the host triple
 *   bun run scripts/fetch-python.ts --triple aarch64-apple-darwin
 *   bun run scripts/fetch-python.ts --all      # every pinned triple (for a release build)
 *
 * Pins verified 2026-07-20. Re-pin by bumping TAG/PY_VERSION and pasting the SHA256SUMS
 * lines from the release. A script, so terminal output is its interface (no Logger).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const TAG = '20260718';
const PY_VERSION = '3.13.14';
const BASE_URL = `https://github.com/astral-sh/python-build-standalone/releases/download/${TAG}`;

type Triple = 'aarch64-apple-darwin' | 'x86_64-apple-darwin' | 'x86_64-pc-windows-msvc';

// sha256 of cpython-<PY_VERSION>+<TAG>-<triple>-install_only.tar.gz
const SHA256: Record<Triple, string> = {
  'aarch64-apple-darwin': 'dca7c3bac21f023cf294705b27f4f3e9c70399c40790ebb81e8d0eff15b00770',
  'x86_64-apple-darwin': '2c7daabe0e94de636064d42f1afa46ea26a303bb23e14f4a64961d36eaecdb73',
  'x86_64-pc-windows-msvc': 'aeacaec792528b8bda4ee7be9dc5721b0a830ba798de4c7d1cf727bc9c246ded',
};

const hostTriple = (): Triple => {
  if (process.platform === 'win32') return 'x86_64-pc-windows-msvc';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  throw new Error(`no pinned python runtime for platform ${process.platform}`);
};

const sha256Hex = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

const fetchTriple = async (triple: Triple): Promise<void> => {
  const file = `cpython-${PY_VERSION}+${TAG}-${triple}-install_only.tar.gz`;
  const dir = join('vendor', 'python', triple);
  mkdirSync(dir, { recursive: true });
  const archive = join(dir, file);

  process.stdout.write(`fetching ${file}\n`);
  const response = await fetch(`${BASE_URL}/${file}`);
  if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`);
  const bytes = new Uint8Array(await response.arrayBuffer());

  const got = await sha256Hex(bytes);
  if (got !== SHA256[triple]) throw new Error(`checksum mismatch for ${file}\n  expected ${SHA256[triple]}\n  got      ${got}`);
  process.stdout.write(`  checksum ok (${bytes.length} bytes)\n`);

  await Bun.write(archive, bytes);
  const tar = Bun.spawn(['tar', '-xzf', archive, '-C', dir]);
  if ((await tar.exited) !== 0) throw new Error(`tar failed for ${file}`);
  process.stdout.write(`  extracted to ${join(dir, 'python')}\n`);
};

const argv = Bun.argv.slice(2);
const only = argv.indexOf('--triple') >= 0 ? (argv[argv.indexOf('--triple') + 1] as Triple) : undefined;
const triples: readonly Triple[] = argv.includes('--all') ? (Object.keys(SHA256) as Triple[]) : [only ?? hostTriple()];

for (const triple of triples) await fetchTriple(triple);
process.stdout.write('done\n');
