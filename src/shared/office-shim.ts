/*
 * The PATH shim that lets the agent call `ask-marcel-office`.
 *
 * The office CLI is a Node program, but a packaged app has no Node on the machine.
 * The shim runs the app's own Electron binary as Node (ELECTRON_RUN_AS_NODE=1) against
 * the CLI's dist/cli.js, so it works on a Node-less machine. It is written into
 * <userData>/bin, which session-env already prepends to the agent's PATH.
 *
 * Pure content generation only; the writer (node:fs + chmod) is the IO shell. Both
 * paths are app-controlled (the Electron binary and our own node_modules resolution),
 * so they travel inside one trust zone (rule 12) and are only double-quoted here to
 * survive spaces in the install path, not to sanitise untrusted input.
 */
export type OfficeShimInput = {
  readonly execPath: string;
  readonly cliPath: string;
};

export type OfficeShimScripts = {
  // <userData>/bin/ask-marcel-office
  readonly unix: string;
  // <userData>/bin/ask-marcel-office.cmd
  readonly windows: string;
};

export const officeShimScripts = ({ execPath, cliPath }: OfficeShimInput): OfficeShimScripts => ({
  unix: `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 NO_UPDATE_NOTIFIER=1 exec "${execPath}" "${cliPath}" "$@"\n`,
  windows: `@echo off\nset "ELECTRON_RUN_AS_NODE=1"\nset "NO_UPDATE_NOTIFIER=1"\n"${execPath}" "${cliPath}" %*\n`,
});
