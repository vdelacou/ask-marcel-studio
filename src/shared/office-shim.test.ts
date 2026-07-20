import { describe, expect, test } from 'bun:test';
import { officeShimScripts } from './office-shim.ts';

const execPath = '/Applications/Ask Marcel Studio.app/Contents/MacOS/Electron';
const cliPath = '/Users/x/Library/Application Support/ask-marcel-studio/node_modules/ask-marcel-office-cli/dist/cli.js';

describe('the ask-marcel-office PATH shim', () => {
  test('the unix shim runs the cli through electron as node, with every arg passed on', () => {
    const { unix } = officeShimScripts({ execPath, cliPath });

    expect(unix.startsWith('#!/bin/sh\n')).toBe(true);
    expect(unix).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(unix).toContain('NO_UPDATE_NOTIFIER=1');
    expect(unix).toContain(`exec "${execPath}" "${cliPath}" "$@"`);
  });

  test('the windows shim passes every argument through', () => {
    const { windows } = officeShimScripts({ execPath, cliPath });

    expect(windows).toContain('@echo off');
    expect(windows).toContain('set "ELECTRON_RUN_AS_NODE=1"');
    expect(windows).toContain('set "NO_UPDATE_NOTIFIER=1"');
    expect(windows).toContain(`"${execPath}" "${cliPath}" %*`);
  });

  test('a path containing spaces stays a single quoted argument', () => {
    const { unix, windows } = officeShimScripts({ execPath, cliPath });

    // execPath has a space ("Ask Marcel Studio.app"): it must be double-quoted in both.
    expect(unix).toContain(`"${execPath}"`);
    expect(windows).toContain(`"${execPath}"`);
  });
});
