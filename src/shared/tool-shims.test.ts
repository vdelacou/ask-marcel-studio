import { describe, expect, test } from 'bun:test';
import { toolShimScripts } from './tool-shims.ts';

const execPath = '/Applications/Ask Marcel Studio.app/Contents/MacOS/Electron';
const npmCliPath = '/Applications/Ask Marcel Studio.app/Contents/Resources/app.asar/node_modules/npm/bin/npm-cli.js';
const npxCliPath = '/Applications/Ask Marcel Studio.app/Contents/Resources/app.asar/node_modules/npm/bin/npx-cli.js';
const npmPrefixDir = '/Users/x/Library/Application Support/ask-marcel-studio/npm-global';
const npmCacheDir = '/Users/x/Library/Application Support/ask-marcel-studio/npm-cache';

const input = { execPath, npmCliPath, npxCliPath, npmPrefixDir, npmCacheDir };

describe('the node PATH shim', () => {
  test('the unix shim runs the app binary as node with every arg passed on', () => {
    const { node } = toolShimScripts(input);

    expect(node.unix.startsWith('#!/bin/sh\n')).toBe(true);
    expect(node.unix).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(node.unix).toContain(`exec "${execPath}" "$@"`);
  });

  test('the windows shim passes every argument through', () => {
    const { node } = toolShimScripts(input);

    expect(node.windows).toContain('@echo off');
    expect(node.windows).toContain('set "ELECTRON_RUN_AS_NODE=1"');
    expect(node.windows).toContain(`"${execPath}" %*`);
  });
});

describe('the npm and npx PATH shims', () => {
  test('npm runs npm-cli through the app binary with installs kept inside the data folder', () => {
    const { npm } = toolShimScripts(input);

    expect(npm.unix).toContain(`exec "${execPath}" "${npmCliPath}" "$@"`);
    // Space-separated assignments: pins the unix join so it cannot collapse to one token.
    expect(npm.unix).toContain(`ELECTRON_RUN_AS_NODE=1 npm_config_prefix="${npmPrefixDir}"`);
    expect(npm.unix).toContain(`npm_config_cache="${npmCacheDir}"`);
    expect(npm.windows).toContain(`"${execPath}" "${npmCliPath}" %*`);
    // Adjacent set lines, one per line with nothing between them: pins the join.
    expect(npm.windows).toContain(`set "ELECTRON_RUN_AS_NODE=1"\nset "npm_config_prefix=${npmPrefixDir}"\n`);
  });

  test('the npm update notifier stays off, so a turn never blocks on a version nag', () => {
    const { npm, npx } = toolShimScripts(input);

    expect(npm.unix).toContain('npm_config_update_notifier=false');
    expect(npx.unix).toContain('npm_config_update_notifier=false');
  });

  test('npx mirrors npm against npx-cli', () => {
    const { npx } = toolShimScripts(input);

    expect(npx.unix).toContain(`exec "${execPath}" "${npxCliPath}" "$@"`);
    expect(npx.windows).toContain(`"${execPath}" "${npxCliPath}" %*`);
  });

  test('paths containing spaces stay single quoted arguments', () => {
    const { node, npm } = toolShimScripts(input);

    expect(node.unix).toContain(`"${execPath}"`);
    expect(npm.windows).toContain(`"${npmCliPath}"`);
  });
});
