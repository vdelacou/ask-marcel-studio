# PLAN: Ask Marcel Studio M8 (embedded runtimes: node + npm first, then python)

Status: planning approved by the user 2026-07-20, step order confirmed (shims, node+npm,
then python). Nothing committed yet. M0-M5, M7 and M4 are COMPLETE and pushed
(github.com/vdelacou/ask-marcel-studio). M6 (packaging) stays blocked on Apple Silicon.

## Goal

The agent gets `node`, `npm`, `npx`, and later `python3`/`pip3` on its PATH with zero user
setup, offline once installed, self-contained (everything under the app bundle + userData,
nothing system-wide). Targets: macOS arm64 + Windows x64 (user decision); dev machine is
Intel x64 mac, so dev-mode python needs its own triple. NOT a security sandbox: the runtimes
run with user permissions, same trust as the agent's bash tool (documented, accepted).

## Verified (do not guess)

- `officeShimScripts` ALREADY emits both unix and .cmd content, and `writeOfficeShim`
  already writes both files. The planned "refactor office shim into a cross-platform
  writer" is moot; deviation: new `tool-shims.ts` sits alongside, office stays untouched.
- Dev machine is Intel x64 (LESSONS gotcha 2026-07-17): python dev triple is
  x86_64-apple-darwin; ship triples are aarch64-apple-darwin + x86_64-pc-windows-msvc.
- Node runtime: Electron IS Node under ELECTRON_RUN_AS_NODE=1 (office shim pattern).
  npm/npx are NOT bundled with Electron; the `npm` package is pure JS, resolvable via
  createRequire like ask-marcel-office-cli (index.ts:83-84 pattern).
- session-env.ts:62 joins PATH with a hardcoded ':'; Windows needs ';' (path.delimiter).
- ASAR + ELECTRON_RUN_AS_NODE: asar support stays on in run-as-node children unless
  ELECTRON_NO_ASAR is set; npm-cli.js from inside asar is UNVERIFIED until M6 (flagged).

## Placement (coverage tiers)

- Pure -> `src/shared/`: `tool-shims.ts`, later `python-paths.ts`, `python-status.ts`
  (100% + mutation; run `bun run mutate:changed` BEFORE staging, M4 lesson).
- Bun-testable service -> `src/main/services/python/python-service.ts` in
  BUN_TESTABLE_MAIN (80%), injected fs/run seams, regen coverage-preload.
- IO shells (shim write, venv spawn) -> thin, skipped tier, wired in index.ts.

## Steps

Phase A: node + npm (near-free, no vendor matrix)
1. [x] `tool-shims.ts` (+NEW test, shared): sh + .cmd generators for node/npm/npx;
       npm/npx get npm_config_prefix/cache + update-notifier off  DoD MET: 100%, 6 tests
2. [x] `paths.ts`: `npmPrefixDir`, `npmCacheDir` (+1 case in paths.test.ts, signed off)  DoD MET: 100%
3. [x] `bun add npm@12.0.1`; `writeToolShims` IO shell + index.ts wiring (createRequire
       resolve of npm/bin/npm-cli.js + npx-cli.js)  DoD MET: proved live against the real
       electron binary with EMPTY PATH: `node -e` -> node=24.18.0 electron=43.1.1;
       `npm --version` -> 12.0.1; `npm i -g leftpad` -> landed in the data-folder prefix,
       prefix/cache/notifier vars all honored
4. [x] `session-env.ts`: OS path.delimiter, injectable for tests (session-env.test.ts +1
       Windows case, signed off)  DoD MET: ';' on win32 via injected delimiter, ':' default, green
5. [~] live agent verify: a real turn runs `node -e` through the shim. MECHANISM PROVEN
       (shim resolves via electron-as-node, empty PATH); the in-app agent turn needs the
       running app + a key (gated, same as the M2 live-turn gap)

Phase B: python (vendor matrix + provision)
PINS (verified 2026-07-20, scratchpad/python-pins.md): python-build-standalone tag 20260718,
CPython 3.13.14 install_only. sha256: aarch64-apple-darwin dca7c3...999c, x86_64-apple-darwin
2c7daa...db73, x86_64-pc-windows-msvc aeacae...4ded. Layout: tarball -> python/; unix bin
python/bin/python3, win python/python.exe; venv unix bin/python, win Scripts/python.exe.
FULL MECHANISM PROVEN on host: download+checksum -> extract -> venv (pip 26.1.2) ->
`pip install --no-index --find-links` openpyxl -> import ok, all under `env -i` (offline).
6. [x] `scripts/fetch-python.ts` + `fetch:python` + vendor/ gitignored  DoD MET: host fetch
       verifies checksum (25MB) and extracts; binary runs Python 3.13.14
7. [x] `fetch-wheels.ts` + `fetch:wheels`: pip download openpyxl+pandas (pulls numpy,
       dateutil, six, et_xmlfile) into vendor/wheels/  DoD MET: offline install of ALL
       into a fresh venv + `import pandas` proven
8. [x] `python-paths.ts` (+NEW test): runtime binary, venv layout, marker, platformOf
       DoD MET: 100% coverage + 100% mutation, Windows branch tested via win32.join
9. [x] python shim entries in `tool-shims.ts` (python3/python + pip3/pip, PYTHONNOUSERSITE=1,
       PIP_CACHE_DIR). SSL_CERT_FILE DEFERRED (pip's own certs work; local data needs no SSL;
       follow-up for agent HTTPS from python)  DoD MET: 100% coverage + 100% mutation
10. [x] `python-status.ts` (shared) + `python-service.ts`/`python-io.ts` (BUN_TESTABLE_MAIN):
        venv create + offline wheel seed + marker + rebuild-on-version-change + single-flight
        + timeout  DoD MET: 100% coverage/mutation; live provision + import openpyxl proven
10w [x] index.ts wiring: provisionPython at launch (packaged -> resources, dev -> vendor/),
        seed ['openpyxl','pandas'], build 3.13.14+20260718  DoD MET: typecheck+lint green
11. [ ] `python:status` IPC + preload + CHANNEL pin (ipc-contract.test.ts, SIGN-OFF) +
        settings row  DoD: panel shows ready/provisioning
12. [~] live verify: MECHANISM fully proven (shim->venv->import, provision end to end, all
        offline). In-app launch provision + an agent turn need the running app (gated, HMR).
13. [~] docs: README node/npm/python paragraph done; docs/PLAN.md M6 addendum (extraResources
        runtime+wheels matrix, mac sign walk + disable-library-validation, cross-platform
        wheel --platform fetch, npm-in-asar) still to write.

## Risks

- A missed Mach-O in the python tree breaks notarization: M6 afterPack hook must sign-walk
  and FAIL on any unsigned binary (documented in step 13, executed at M6).
- Windows path untestable here (no Windows box): code is platform-keyed and unit-tested,
  live Windows verification is a standing gap like M6 hardware.
- Defender may sandbag first python.exe run: provision has a timeout + failed status.
- venvs embed absolute prefixes: marker re-provisions on prefix or version change.

## Gated on the user (carried forward from M4/M7)

- Office interactive login button end-to-end needs a signed-out start (user drives).
- M7 live visual pass (screen capture blocked); user verifies via HMR.
- Live Anthropic-key turn + SDK resume verification; M6 arm64 DMG needs Apple Silicon.

## Discipline

TDD per slice, every NEW test proposed for sign-off before writing (rule 24); the three
SIGN-OFF items above touch existing test files and each needs an explicit yes. Commit per
green slice through the real hook, only on the user's yes (rule 25). Commits ≤10 files /
≤300 lines.
