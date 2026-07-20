#!/usr/bin/env bun
/*
 * Vendor the seed wheels the embedded Python is provisioned with.
 *
 * Uses the vendored runtime's own pip (so the wheels match its version and ABI) to
 * download the seed set plus its transitive deps into vendor/wheels/ (git-ignored). The
 * provision service later installs them with `pip install --no-index`, so a fresh machine
 * needs no network. Run after `bun run fetch:python`.
 *
 *   bun run fetch:wheels
 *
 * Cross-platform note: pip download fetches wheels for THIS host's platform and ABI. A
 * release build that targets another OS/arch needs pip's --platform/--abi flags to fetch
 * that target's binary wheels (numpy, pandas); that matrix rides with M6 packaging. A
 * script, so terminal output is its interface (no Logger).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// openpyxl reads/writes xlsx; pandas (pulling numpy, dateutil, six) is the workhorse for
// local data. Both are pure enough or ship binary wheels for every target we build.
const SEED = ['openpyxl', 'pandas'];

const hostTriple = (): string => {
  if (process.platform === 'win32') return 'x86_64-pc-windows-msvc';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  throw new Error(`no vendored python runtime for platform ${process.platform}`);
};

const runtimePython = (): string => {
  const root = join('vendor', 'python', hostTriple(), 'python');
  return process.platform === 'win32' ? join(root, 'python.exe') : join(root, 'bin', 'python3');
};

const dest = join('vendor', 'wheels');
mkdirSync(dest, { recursive: true });

process.stdout.write(`downloading seed wheels (${SEED.join(', ')}) into ${dest}\n`);
const proc = Bun.spawn([runtimePython(), '-m', 'pip', 'download', '--dest', dest, ...SEED], { stdout: 'inherit', stderr: 'inherit' });
const code = await proc.exited;
if (code !== 0) throw new Error(`pip download failed with exit ${code}`);
process.stdout.write('done\n');
