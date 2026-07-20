/*
 * PATH shims that give the agent `node`, `npm`, and `npx` with no Node on the machine.
 *
 * Electron IS Node when ELECTRON_RUN_AS_NODE=1, so `node` is the app's own binary with
 * every arg passed straight through. npm and npx are not bundled with Electron, but the
 * `npm` package is pure JS: the shims run its bin/npm-cli.js and bin/npx-cli.js through
 * the same run-as-node binary. Global installs and the cache are pinned inside the app's
 * data folder (npm_config_prefix / npm_config_cache), so `npm i -g` never touches the
 * system or the signed bundle, and the update notifier is off so a turn never blocks on
 * a version nag. This mirrors office-shim.ts; the writer (node:fs + chmod) is the IO shell.
 *
 * Pure content only. Every path is app-controlled (process.execPath, createRequire
 * resolution, userData joins), so they travel inside one trust zone (rule 12) and are
 * double-quoted only to survive spaces in the install path, not to sanitise input.
 */
export type ToolShimInput = {
  readonly execPath: string;
  readonly npmCliPath: string;
  readonly npxCliPath: string;
  readonly npmPrefixDir: string;
  readonly npmCacheDir: string;
};

export type ShimPair = {
  // <userData>/bin/<tool>
  readonly unix: string;
  // <userData>/bin/<tool>.cmd
  readonly windows: string;
};

export type ToolShimScripts = {
  readonly node: ShimPair;
  readonly npm: ShimPair;
  readonly npx: ShimPair;
};

// A literal value (1, false) is left bare on unix; a path value is quoted so a space in
// the install location cannot split it. Windows `set "K=V"` quotes the whole assignment
// either way, so it needs no per-entry flag.
type EnvEntry = { readonly key: string; readonly value: string; readonly quoteUnix: boolean };

const unixAssign = (e: EnvEntry): string => (e.quoteUnix ? `${e.key}="${e.value}"` : `${e.key}=${e.value}`);

const shimPair = (env: readonly EnvEntry[], execPath: string, cliPath: string | undefined): ShimPair => {
  const cliArg = cliPath === undefined ? '' : ` "${cliPath}"`;
  const unix = `#!/bin/sh\n${env.map(unixAssign).join(' ')} exec "${execPath}"${cliArg} "$@"\n`;
  const sets = env.map((e) => `set "${e.key}=${e.value}"\n`).join('');
  const windows = `@echo off\n${sets}"${execPath}"${cliArg} %*\n`;
  return { unix, windows };
};

const RUN_AS_NODE: EnvEntry = { key: 'ELECTRON_RUN_AS_NODE', value: '1', quoteUnix: false };

export const toolShimScripts = ({ execPath, npmCliPath, npxCliPath, npmPrefixDir, npmCacheDir }: ToolShimInput): ToolShimScripts => {
  const npmEnv: readonly EnvEntry[] = [
    RUN_AS_NODE,
    { key: 'npm_config_prefix', value: npmPrefixDir, quoteUnix: true },
    { key: 'npm_config_cache', value: npmCacheDir, quoteUnix: true },
    { key: 'npm_config_update_notifier', value: 'false', quoteUnix: false },
  ];
  return {
    node: shimPair([RUN_AS_NODE], execPath, undefined),
    npm: shimPair(npmEnv, execPath, npmCliPath),
    npx: shimPair(npmEnv, execPath, npxCliPath),
  };
};
