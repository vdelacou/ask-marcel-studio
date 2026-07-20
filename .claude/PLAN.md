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
6. [ ] `scripts/fetch-python.ts`: pinned python-build-standalone URL + sha256 per triple
       (x86_64-apple-darwin dev, aarch64-apple-darwin, x86_64-pc-windows-msvc) into
       git-ignored `vendor/python/<triple>/`  DoD: fetch for host triple verifies checksum
7. [ ] wheels fetch into `vendor/wheels/<platform>/`: openpyxl, certifi (pure, shared) +
       pandas, numpy (per-platform)  DoD: `pip install --no-index --find-links` succeeds
8. [ ] `python-paths.ts` (+NEW test): runtime binary, venv layout (bin/ vs Scripts\),
       marker path, per platform  DoD: 100%, mutation-clean
9. [ ] python shim entries in `tool-shims.ts` (python3/python/pip3, SSL_CERT_FILE ->
       venv certifi, PYTHONNOUSERSITE=1, PIP_CACHE_DIR)  DoD: 100%
10. [ ] `python-service.ts` (+NEW test, BUN_TESTABLE_MAIN): provision = venv create +
        wheel seed + version marker; re-provision on runtime version change; timeout +
        failed status (never hangs)  DoD: 80%+, hand-written fakes
11. [ ] `python:status` IPC + preload + CHANNEL pin (+2 lines ipc-contract.test.ts,
        SIGN-OFF) + settings row  DoD: typecheck green, panel shows ready/provisioning
12. [ ] live verify: agent turn runs `python3 -c "import openpyxl"` offline  DoD: tool card
13. [ ] docs: README runtimes section + docs/PLAN.md M6 addendum (extraResources matrix,
        mac sign walk + disable-library-validation entitlement, npm-in-asar check,
        MAX_PATH short venv root `%APPDATA%/ask-marcel-studio/py`)  DoD: docs updated

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
