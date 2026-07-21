# Lessons (committed)

Append-only institutional memory for this codebase. See the atelier skill's `references/lessons.md` for the format and rules.

Each entry is one of `[mistake]`, `[decision]`, or `[gotcha]`. Newest first.

---

## [decision] 2026-07-20 | embedded runtimes: node/npm reuse ELECTRON_RUN_AS_NODE, python is vendored

M8 gives the agent language runtimes with no install on the user's machine. node/npm/npx cost nothing extra: Electron IS Node under `ELECTRON_RUN_AS_NODE=1`, so a shim execs the app's own binary, and only the pure-JS `npm` package is vendored (its bin scripts run through that same binary). Python has no equivalent hiding in Electron, so it needs a real vendored runtime: a python-build-standalone `install_only` tarball (pinned by tag + sha256 in `scripts/fetch-python.ts`), extracted to a `python/` folder, plus a first-launch venv under `<userData>/py` seeded offline from bundled wheels (`pip install --no-index --find-links`). The venv is stamped with the runtime build and rebuilt when that changes, because a venv embeds its interpreter's absolute prefix and cannot survive a runtime bump. The shims (`src/shared/tool-shims.ts`) and paths (`src/shared/python-paths.ts`) are pure and platform-keyed so the Windows branch is unit-tested on macOS via `path.win32.join`.
Applies to: any future runtime the agent should carry, and the M6 packaging (extraResources runtime + wheels per target, hardened-runtime sign-walk, `disable-library-validation` entitlement).

## [gotcha] 2026-07-20 | ESLint flat config does not honor .gitignore, so a fetched vendor/ breaks lint

`bun run fetch:python` extracts an embedded CPython into `vendor/`, which is git-ignored. `lint:strict` runs `eslint` with no path argument, and ESLint's flat config ignores `.gitignore` entirely: it linted the runtime's bundled JS (pip's vendored urllib3) and failed the commit on `no-undef` for `self`, `fetch`, `TextEncoder`. The fix is to add `vendor/**` to ESLint's own `ignores` block. bun test, coverage, typecheck (tsconfig `include` is explicit), and gitleaks (staged-only) were all unaffected; only ESLint's catch-all glob was.
Rule for next time: anything fetched into the working tree that ESLint could glob needs an entry in the ESLint `ignores`, not just `.gitignore`.

## [gotcha] 2026-07-20 | mutate:changed skips untracked files, so a new shared module is unmutated until staged

`scripts/mutate-changed.sh` collects files via `git diff ... HEAD`, which does not list untracked files. A brand-new `src/shared/*.ts` created in the working tree is therefore silently outside the mutation set, and a green `mutate:changed` says nothing about it. Verify a new shared module with `mutate:staged` (stage it first) or a direct `bunx stryker run --mutate <file>`. Related: stryker's `incremental: true` keys on source hashes, so a test-only edit to kill a mutant reports stale unless `reports/stryker-incremental.json` is deleted first (the mutate scripts do this; a direct `bunx stryker` call does not).
Rule for next time: absence from a `mutate:changed` run is not coverage; stage new files or target them explicitly.

## [gotcha] 2026-07-20 | pip on python-build-standalone works with an empty env, so SSL_CERT_FILE can wait

Provisioning and package installs were proven under `env -i` (no PATH, no `SSL_CERT_FILE`, no system CA bundle): pip reaches PyPI and installs fine because it ships its own vendored certificates. So the embedded python's `SSL_CERT_FILE` (pointing at certifi's bundle) is only needed for the agent's OWN python code making HTTPS calls, not for pip. That let M8 ship the shims with just `PYTHONNOUSERSITE=1` and `PIP_CACHE_DIR` and defer `SSL_CERT_FILE` as a non-breaking follow-up. `certifi` was dropped from the seed for the same reason.
Applies to: the deferred SSL work, and any assumption that a standalone python needs CA wiring before pip can run.

## [gotcha] 2026-07-20 | npm re-spawns node through our own PATH shim, so `npm i -g` works offline; asar stays unverified

Verified against the real Electron binary with an empty PATH: `ELECTRON_RUN_AS_NODE=1 electron npm-cli.js --version` runs, and a full `npm install -g leftpad` succeeds with only `<userData>/bin` on PATH, landing in the data-folder prefix (`npm_config_prefix`). This works because when npm re-spawns `node` for its own steps it resolves our `node` shim, which is electron-as-node again, closing the loop. All of this ran in dev where the CLIs resolve from repo `node_modules`; the packaged case reads `npm-cli.js` and `cli.js` out of `app.asar`, which is expected to work but stays UNVERIFIED until M6 (fallback: `asarUnpack` those packages).
Applies to: the office CLI and node/npm/npx shims alike, and the M6 packaging smoke test.

## [decision] 2026-07-19 | untestable renderer wiring lives outside src/renderer/src/lib, the 100% coverage tier

M7 added a React hook (`use-conversations`) and the markdown/shiki renderer (`render/markdown`), and `bun test` can run neither: a hook needs a React runtime and react-markdown needs a DOM. `check-coverage.ts` gives `src/renderer/src/lib/` the 100% tier on the premise that everything there is pure logic the runner executes for real, so these two do not belong in it. They live in `src/renderer/src/hooks/` and `src/renderer/src/render/`, which fall into the skipped tier alongside the components. Pure, tested renderer logic (format-usage, conversation-list, ui-event-fold) stays in lib.
Rule for next time: if `bun test` cannot run a renderer module, it does not go in `src/renderer/src/lib`. See the paired gotcha below.

## [gotcha] 2026-07-19 | a renderer/src/lib file no test imports is invisible to the coverage gate, not failed by it

`bun test --coverage` only reports files a test actually loads, and `check-coverage.ts` only judges files present in that report. A module placed in the 100% `src/renderer/src/lib/` tier but imported by nothing the runner can execute never appears, so the gate passes it by absence rather than proving it covered. That is the "silently ungated by invisibility" hazard the script's own WARNING names, and it was live during M7: `use-conversations` and `markdown` would have sat in lib at an unmeasured 0% and the run would still have been green. The fix was to move them out of lib, not to trust the green.
Rule for next time: a file's absence from the coverage report is not coverage. Only the shared kernel is force-imported by the coverage preload, so nothing else is proven merely by a passing run.

## [gotcha] 2026-07-17 | the sdk sends system-role messages inside `messages`, and ai rejects them by default

The gateway's first real turn died on `400 unknown message role: system`, from the translator's own guard. Anthropic documents `system` as a top-level field, so accepting only user and assistant roles looked right and even had a test asserting the rejection — the test encoded a false assumption that live traffic disproved in one request. The SDK really does put system-role messages in the array. ai v7 accepts them only when `allowSystemInMessages: true`, which defaults to false, so BOTH the translator and the streamText call had to change.
Rule for next time: a guard rejecting something "the API does not allow" is a guess until a real client has been through it.

## [gotcha] 2026-07-17 | query's `model` option overrides ANTHROPIC_MODEL, so the gateway needs the full reference twice

session-env correctly set `ANTHROPIC_MODEL=lmstudio::qwen2.5` for the gateway path, but the turn still failed with "an issue with the selected model (qwen2.5)": agent-runtime passed the BARE model id as `query({ options: { model } })`, and that option wins over the env var. The gateway then could not parse a providerId out of it and 404'd. Both the env var and the query option must carry `providerId::modelId` when routing through the gateway, and the bare id when talking to Anthropic directly.
Applies to: any future option that also exists as an ANTHROPIC_* env var.

## [gotcha] 2026-07-17 | ai v7 renamed the stream property and the text field; fullStream is deprecated

`docs/PLAN.md` was written against ai v4/v5 and both of its assumptions are stale. `result.fullStream` is deprecated in v7 in favour of `result.stream` (identical type), and the text part carries `text` where v4 called it `textDelta`. v7 also streams tool arguments natively as tool-input-start/delta/end, and emits a whole `tool-call` part IN ADDITION — relaying both hands the agent the same tool twice, the same trap as the assistant message repeating streamed text in sdk-event-fold. The plan's "emit one input_json_delta with the full JSON" is still needed, but as a fallback for providers that skip the deltas.
Applies to: the gateway reducer, and any future ai upgrade — re-read the part names first.

## [mistake] 2026-07-17 | a test asserted against a shared tmpdir path and failed for the wrong reason

The skills traversal test asserted `existsSync(join(userData, '..', 'evil'))` is false, but `userData` is an mkdtemp under `tmpdir()`, so the sibling resolves to a path shared with every other process on the machine. A stale folder left by an earlier run in the same session failed the test while the production code was provably correct — deleting the folder and re-running proved `add()` never recreates it. Scoping the assertion to this run's own skills folder makes it deterministic. Note `grep -c` also prints `0` AND exits non-zero, so `n=$(grep -c … || echo 0)` yields `"0\n0"` and every equality check against `"0"` silently reports a leak; that pattern produced a second false alarm in the same hour.
Rule for next time: assert inside the fixture you created, never a sibling of it, and never build a shell check on `grep -c … || echo 0`.

## [gotcha] 2026-07-17 | CLAUDE_CONFIG_DIR isolates the user's own skills, but the SDK's built-ins still load

Verified by capturing what the agent actually sends: with `CLAUDE_CONFIG_DIR` pointed at userData and `settingSources: ['user']`, none of the developer's personal `~/.claude` skills reach the app's agent, while both of the app's own do. The list the model sees is NOT only ours, though: `systemPrompt: { preset: 'claude_code' }` also brings the SDK's bundled skills (code-review, verify, run, deep-research and friends). That is expected rather than a leak, but it means the agent in this app can reach for tools the product never advertised, and the skills panel will not list them.
Applies to: any future claim that the app controls exactly which skills the agent has.

## [decision] 2026-07-17 | risk R7 confirmed: a new skill applies on the next message, no hot reload needed

`docs/PLAN.md` assumes a fresh SDK process per turn means an added skill is picked up on the next message. Confirmed by capturing the agent's actual API request: a skill copied into `claude-config/skills` after launch appears in the very next turn's payload, with no restart. So the panel needs no reload machinery and no restart prompt. Verified by planting a marker string in the skill's description and grepping the captured request body.
Applies to: the skills panel, which can stay stateless.

## [gotcha] 2026-07-17 | noUncheckedIndexedAccess was off, so the types lied about array access

`lint:strict` flagged `providers[0] === undefined` as "always false", which looked like dead code but was the opposite: without `noUncheckedIndexedAccess`, TypeScript types every index access as present, so `providers[0]` on an EMPTY array is typed `Provider` while returning `undefined` at runtime. The defensive checks were correct and the type system was wrong. Neither `strict: true` nor `@electron-toolkit/tsconfig` enables the flag, so it was silently off from M0. Turning it on in both tsconfigs produced zero new errors, because the code already guarded every index access.
Applies to: both tsconfigs; keep the flag on, and read an "always false" comparison as a possible missing flag before deleting the check.

## [decision] 2026-07-17 | M2 is verified against a fake Anthropic endpoint, not a live key

`docs/PLAN.md` gates M2's definition of done on a live Anthropic key, which the agent does not have. `scripts/fake-anthropic.mjs` speaks the real SSE wire protocol instead (message_start, content_block_delta, tool_use with input_json_delta, message_delta, message_stop), so everything except the model itself is real: real SDK, real agent subprocess, real tool execution, real IPC, real renderer. It proved the whole path, including the agent genuinely running `echo MARCEL_WAS_HERE` and the output coming back into a tool card. Keep it for M5, where the gateway has to emit exactly this wire format.
Applies to: verifying any turn-shaped behaviour without spending a key.

## [mistake] 2026-07-17 | two harness bugs read as app bugs during M2 verification

A probe showed no assistant reply and then a missing tool card, both of which looked like real defects and were not. First, the fake endpoint chose its response from a global turn counter that survived across runs, so a later probe got the wrong turn; keying off whether the request body contains a `tool_result` made it stateless and correct. Second, the probe created its own BrowserWindow while main creates its own, and main emits chat events to ITS window, so the events were arriving at a window the probe never inspected. Both wasted a debugging cycle chasing the wrong layer.
Rule for next time: when a probe shows nothing, suspect the probe before the app — confirm the harness is observing the same objects the app is using.

## [gotcha] 2026-07-17 | query.interrupt() silently no-ops with a string prompt; cancel must use abortController

`docs/PLAN.md` specifies cancel via `query.interrupt()`, and the method does exist on the Query type in 0.3.185, so it typechecks. But the SDK documents control requests as "only supported when streaming input/output is used", and the runtime honours that by doing nothing rather than complaining: probed against a hanging local server with a string prompt, `interrupt()` RESOLVED while the generator kept running and kept emitting. A silent success is the worst failure mode, since nothing surfaces it. `Options.abortController` is the mechanism that actually works: it stops the query, emission ceases, and the generator throws `Claude Code process aborted by user`, which the runtime must recognise as a user cancel rather than report as an error.
Applies to: the M2 agent runtime's cancel path, and any later use of setPermissionMode or setModel, which are control requests with the same constraint.

## [mistake] 2026-07-17 | main validated the api key but stored the untrimmed one

`validateSettings` rejected a blank key with `apiKey.trim().length === 0` and then stored the raw `apiKey`, so a key pasted with a trailing newline was encrypted verbatim and would have been sent to the provider, returning a 401 that reads like a bad key. Every unit test passed because the renderer's `draftsToSettings` trims first, so no test ever handed main an untrimmed key; only driving the real app and calling `studio.settings.save()` directly exposed it. Main is the authoritative validator and must never depend on the caller having normalised its input.
Rule for next time: when a validator checks `x.trim()`, it must store `x.trim()` — and test the boundary directly, not through the layer that already cleans the input.

## [gotcha] 2026-07-17 | a branded type is a compile-time proof and does not survive IPC

`RenameConversationInput.id` was typed as the branded `ConversationId`, which typechecked and looked safe but was a lie: a brand is erased at runtime, and anything crossing IPC is JSON, so whatever the renderer sends arrives in main as an untrusted plain string. Typing an IPC payload as branded claims a validation that has not happened and invites a caller to skip the checkpoint. Every id entering main over IPC is therefore typed `string` and re-branded at the boundary via `conversationId()`; the same applies to any future branded value on the wire.
Rule for next time: brands stop at the process boundary — re-validate on arrival, never type the wire as branded.

## [decision] 2026-07-17 | hard rule 20 (Bun file API) cannot apply in the Electron main process

Rule 20 requires all file IO under `src/**` to go through `Bun.file` / `Bun.write`, but the main process runs in Electron's Node runtime where the `Bun` global does not exist, so `node:fs/promises` is the only option there. The IO is confined to `src/main/services/store/json-file.ts`, which is the single adapter that touches bytes, and the atomic write is tmp-plus-rename in the SAME directory because rename(2) is only atomic within a filesystem (a temp file in os.tmpdir() would degrade to a non-atomic copy). Rule 20 still binds anything that runs under Bun, including every test.
Applies to: any new file IO in the main process.

## [decision] 2026-07-17 | provider API keys are encrypted at rest with Electron safeStorage

`docs/PLAN.md` types `Provider.apiKey` as a plain `string` in `settings.json` under `userData`, which for a single-user local app is defensible but leaves a real secret readable in a plaintext file. The user chose `safeStorage` (macOS Keychain-backed) over plaintext, so the key is encrypted before write and decrypted on read. The encryption lives in the store's IO shell and never in its pure core, which keeps electron out of `src/shared/**` and out of the 100% coverage tier. This forks `Provider` into a stored shape carrying an opaque `{ enc }` envelope and a runtime shape carrying the plaintext string, and the shell must return a typed err when `safeStorage.isEncryptionAvailable()` is false rather than throwing.
Applies to: the Provider type, the settings store, and any future secret this app persists.

## [decision] 2026-07-17 | stores split into a pure core plus a thin IO shell

Store modules are main-process IO, so under the retuned COVERAGE_RULES they fall in the skipped "electron surface" tier and would carry no coverage or mutation gate at all. Each store therefore splits into a pure module under `src/shared/` holding the parse, validate and merge logic (100% tier, inside the Stryker glob) and a thin electron-side shell that only reads and writes bytes. This is the same pressure Clean Architecture already applies and it is what makes the M2 event folds testable, so it costs one extra file per store and buys back the gate.
Applies to: settings-store, conversations-store, and every later module that mixes logic with electron IO.

## [mistake] 2026-07-17 | sealed rule 22 by enumerating globs, which left new renderer files unsealed

The styling-seal block originally listed `page/**`, `lib/**`, `app.tsx` and `main.tsx`, which looked complete and linted green. Any other `.tsx` added directly under `src/renderer/src/` would have carried Tailwind classes with no rule firing at all, because a non-matching glob fails open silently rather than erroring. A smoke test with a deliberately violating file caught it; the fix was to seal by exclusion (`files: ['src/renderer/src/**/*.tsx']`, `ignores: ['src/renderer/src/components/**']`) so the default is sealed and the design system is the carve-out.
Rule for next time: express a seal as everything-except, never as a list of the places you remembered.

## [gotcha] 2026-07-17 | a lint rule that never fires looks identical to a lint rule that passes

Both the rule 21 and rule 22 blocks are enforced only by ESLint, and every failure mode of a flat config (misregistered plugin, non-matching `files` glob, a REPLACE collision) fails OPEN: the rule silently stops existing and the run reports success. Green lint is therefore not evidence the design-system seal works. The only proof is a smoke test: write a file that deliberately violates each rule, confirm ESLint rejects it, then delete it. Doing this caught a real hole in the rule 22 globs that had been reporting clean.
Rule for next time: after touching eslint.config.js, prove each new rule fires with a throwaway violating file before trusting a green run.

## [gotcha] 2026-07-17 | jsx-a11y and react need explicit registration once Next is gone

The atelier's canonical design-system ESLint block is written for the Next.js variant, where `next/core-web-vitals` quietly registers the `jsx-a11y` and `react` plugins. Porting that block to a plain React renderer without also adding `plugins: { react, 'jsx-a11y': jsxA11y }` makes every `jsx-a11y/*` and `react/*` entry throw "Definition for rule not found", and the whole config fails to load rather than degrading. The React block also needs `parserOptions.ecmaFeatures.jsx` and `settings.react.version` set by hand.
Applies to: any further rule borrowed from references/nextjs-monorepo.md.

## [gotcha] 2026-07-17 | ESLint flat config replaces rather than merges rules for the same file

Two config objects that both match a file and both declare `no-restricted-imports` (or `no-restricted-syntax`) do not combine: the later object wins outright and the earlier one's entries vanish silently. The design-system block therefore has to re-declare the `bun:test` `mock` ban (hard rule 13) inline alongside its own `patterns`, because relying on the general block to supply it would drop the mock ban for `src/renderer/src/components/**` with no warning. The same hazard is why the rule 22 styling-seal block carries `ignores` for the design system instead of overlapping it.
Rule for next time: when two blocks could match one file, hoist the shared entries into a constant and re-declare them in both, then verify with `eslint --print-config <file>`.

## [gotcha] 2026-07-17 | Stryker needs real node on PATH and bun run hides that it does

Gate 8 runs `bun run mutate:staged`, which passes only because `bun run` delegates a `#!/usr/bin/env node` shim to the real node binary when node is on PATH. Under Bun's own runtime Stryker dies in its Babel instrumenter with "generator is not a function", and `bun run` silently falls back to Bun when node is absent instead of failing loudly, so this breaks only on a machine or CI image without node. Also note `packageManager` in stryker.conf.json must stay `"npm"`: the schema enum is npm/yarn/pnpm only and `"bun"` is a hard ConfigError.
Affects: any CI image for this repo, which must install node even though the toolchain is Bun.

## [gotcha] 2026-07-17 | electron 43 defers a 124MB download to the first require

Because Electron 43 has no postinstall, `bun install` finishes in seconds and the ~124MB binary downloads on the first `require('electron')` instead, measured at roughly two minutes cold. It fires on the first `bun run dev` rather than at install time, which is survivable but surprising. `bun test` never triggers it as long as no test imports electron, which the layout already guarantees. `ELECTRON_SKIP_BINARY_DOWNLOAD` no longer exists in 43, so the old CI trick to suppress it is gone; a root `"postinstall": "install-electron"` is the lever if the download ever needs to be deterministic.
Applies to: first-run experience and any future CI image build.

## [gotcha] 2026-07-17 | the dev machine is Intel x64 but docs/PLAN.md M6 targets a mac arm64 DMG

`uname -m` reports x86_64 on a Core i9-9880H with no Rosetta translation and no arm64 hardware, so every native artifact resolved here is darwin-x64 (`@tailwindcss/oxide-darwin-x64` is what installed). M6 asks for a mac arm64 DMG plus a smoke test on a Node-less account, and risk R2 names the `@anthropic-ai/claude-agent-sdk-darwin-arm64` binary specifically. Cross-building arm64 from x64 is possible with electron-builder, but the arm64 smoke test needs real Apple Silicon hardware. Unresolved: confirm the intended target arch before M6.
Affects: M6 packaging only.

## [gotcha] 2026-07-17 | Stryker's incremental cache reports stale survivors after a test change

Two mutants kept showing as survived in `src/shared/model-ref.ts` after assertions were added that provably kill them. The cause is `incremental: true` plus `incrementalFile: reports/stryker-incremental.json` in the shipped stryker.conf.json, which reused the previous run's verdicts instead of re-evaluating. Deleting the incremental file and rerunning took the score from 95.92% to 100%. A green mutation gate can therefore be a lie right after tests change.
Rule for next time: delete reports/stryker-incremental.json before trusting a mutation score you just tried to improve.

## [gotcha] 2026-07-17 | "type": "module" makes electron-vite emit the preload as .mjs

The upstream electron-vite scaffold writes `preload: join(__dirname, '../preload/index.js')` and works, because that scaffold's package.json has no `type` field and is therefore CJS. Hard rule 9 requires `"type": "module"`, which flips electron-vite's preload output to `index.mjs` and leaves the scaffold's `.js` path silently unresolvable, so the contextBridge never runs and the renderer sees no global. Loading an ESM preload also requires `sandbox: false`. The build succeeds and typecheck passes either way, so only launching the app catches it.
Applies to: any change to the preload path or the package `type` field.

## [gotcha] 2026-07-17 | electron 43 has no postinstall, so risk R1 and trustedDependencies are obsolete

`docs/PLAN.md` R1 says bun blocks electron's postinstall and prescribes `trustedDependencies: [electron, esbuild, @tailwindcss/oxide]`. Electron 43.1.1 ships no `scripts` field at all: `index.js` lazily downloads the binary on first require and exposes a `bin: install-electron` for explicit installs, so there is no lifecycle script to block or trust. Verified independently that esbuild installs its binary with no trustedDependencies (bun default-trusts it) and that @tailwindcss/oxide uses napi optional deps rather than a postinstall, so all three entries were dead weight and were removed. The only blocked script in the tree is electron-winstaller, which is Windows-only and irrelevant to the mac target.
Affects: risk R1 in docs/PLAN.md, which should be struck.

## [gotcha] 2026-07-17 | vite 8 and @vitejs/plugin-react 6 silently break electron-vite 5

A plain `bun add -d vite @vitejs/plugin-react` resolves to vite 8.1.5 + plugin-react 6.0.3, which violates two peer ranges at once: electron-vite@5 caps vite at `^5 || ^6 || ^7`, and plugin-react@6 requires vite `^8.0.0` exclusively. Bun does not hard-fail on peer conflicts, so the install looks clean and the breakage surfaces later at build time. The only combination satisfying every peer today is vite `^7.3.6` + `@vitejs/plugin-react` `^5.2.0`, which is what the official scaffold independently pins.
Rule for next time: after any `bun update`, re-check the vite / plugin-react / electron-vite peer triangle before trusting a green install.

## [gotcha] 2026-07-17 | ask-marcel-office-cli 2.2.0 is not published to npm

`docs/PLAN.md` pins the office CLI at `^2.2.0`, but the npm registry's latest is `2.1.0`. The machine's global `ask-marcel-office` is an npm symlink to the local sibling repo `../ask-marcel-office-cli` sitting at an unpublished 2.2.0, which is why the CLI works locally while the dependency would fail to resolve. The user chose to publish 2.2.0 to npm rather than use a `file:` dependency or downgrade. Blocks M4 and M6 only, not M0-M2.
Affects: the `bun add ask-marcel-office-cli` step at M4.

## [decision] 2026-07-17 | coverage tiers and Stryker globs retuned for the shared/main/preload/renderer layout

The shipped `check-coverage.ts` and `stryker.conf.json` hardcode `src/domain/**` and `src/use-cases/**`, which this Electron layout does not have. Both files ship with an explicit "tune per-project" comment, so retuning them to `src/shared/**` is sanctioned configuration rather than a deviation. `src/shared/**` carries the 100% tier because it is the only tier guaranteed free of electron imports.
Applies to: any new pure module that should be gate-enforced.

## [decision] 2026-07-17 | bun test covers pure modules only; electron importers are excluded

The Bun test runner has no Electron runtime, so a test that imports `electron` crashes the runner rather than failing cleanly. Pure logic therefore lives in `src/shared/**` or in named pure modules that never import electron (`session-env`, `sdk-event-fold`, the gateway translators, `skill-md`, `ui-event-fold`). This is the same pressure Clean Architecture already applies, so it costs nothing to obey. The generated coverage preload must never force-import an electron-importing file, or `bun run coverage` dies at import time.
Rule for next time: if it needs a unit test, it must not import electron.

## [decision] 2026-07-17 | electron-vite and electron-builder are a sanctioned deviation from hard rule 5

Hard rule 5 bans invoking `vite` or `node` directly, assuming Bun both installs and runs the code. Electron cannot run under the Bun runtime: it ships its own Node, and its build needs Vite's three-target main/preload/renderer split. Bun stays the package manager and the unit-test runner while `electron-vite` owns dev/build and `electron-builder` owns packaging. The rejected alternative, hand-rolling a Bun bundler pipeline for three targets, buys nothing and loses HMR.
Applies to: every build and dev command in this repo.

## [decision] 2026-07-17 | this repo is a hybrid variant, not one of atelier's three

Electron + React matches neither the Bun-script, Next.js, nor Java variant, so the standard has no ready-made answer for it. It takes the Bun-script base (eight-gate hooks, `Result`, ESLint + SonarJS flat config) and applies the Next.js variant's rules 21-22 (logic-free design system, Tailwind sealed inside the components tree) to the renderer. Every future UI change obeys 21-22 despite there being no Next.js, and every main-process change obeys the Bun-script rules despite the runtime being Electron's Node.
Applies to: any "which variant is this?" question in this repo.

## [decision] 2026-07-17 | commit identity is the repo-local neutral atelier handle

The machine's global git identity is a company email (`vincent.delacourt@adama-development.com`) and this repo is MIT-licensed and may go public, so an inherited identity would be exactly the accidental leak rule 26 exists to prevent. Set `atelier <atelier@users.noreply.github.com>` via `git config --local` at repo birth, which is the only moment the choice is free. Gate 3 (`gitleaks protect --staged`) scans the diff and is blind to the author field, so nothing else would have caught it.
Applies to: every commit in this repo.

## [gotcha] 2026-07-20 | settingSources: ['user'] does NOT load a CLAUDE.md; use systemPrompt append for always-on content

SDK 0.3.185 `sdk.d.ts:1820` states "Must include `'project'` to load CLAUDE.md files." The agent runs `settingSources: ['user']` (which loads the `CLAUDE_CONFIG_DIR/skills` folder, NOT a memory file), so a seeded `claude-config/CLAUDE.md` would silently never load. The M9 always-on Microsoft 365 core therefore ships via `systemPrompt: { type: 'preset', preset: 'claude_code', append: <core text> }` (`sdk.d.ts:1881`), read from `resources/agent-core/core.md` by the composition root and passed as the `corePrompt` dep. Adding `'project'` to settingSources was rejected: it would also pull any `.claude/settings.json` and `.claude/CLAUDE.md` from the per-conversation workspace cwd, which is not wanted.
Rule for next time: to inject standing instructions into every turn, use the preset `append`, not a CLAUDE.md.

## [gotcha] 2026-07-20 | skill-md.ts reads description as ONE physical line; no folded YAML

The hand-rolled `parseSkillMd` (`src/shared/skill-md.ts`) takes everything after the first colon on the `description:` line as the value; it does not understand YAML folded (`>`) or literal (`|`) block scalars or multi-line continuations. A `description: >` frontmatter parsed to the 1-char value `>`, so the panel showed nothing (the SDK's real YAML parser still loaded the full text, so the skill worked, but the app UI did not). Built-in SKILL.md descriptions must be a single physical line, plain scalar, with NO `: ` colon-space (which would break the SDK's strict YAML parser) and no leading quote/indicator. Mid-string quotes are fine in both parsers.
Applies to: every SKILL.md this app ships or validates via `add`.

## [decision] 2026-07-20 | M365 knowledge ships as an always-on core + two trigger-split skills + a programmatic reader subagent

The single `ask-marcel-office` built-in skill was replaced (M9, grilled decision record in the git history of `.claude/PLAN.md`) by: (1) a compact always-on core appended to every turn (CLI nature, auth doctrine, routing table, ground rules, Sources footer); (2) two on-demand skills split by TRIGGER not source — `answer-from-m365` (read) and `draft-outlook-email` (write) — because the read sections co-fire on real questions while draft has disjoint triggers and safety rules; (3) `m365-reader`, a programmatic subagent (`agents` option in agent-runtime, versioned in-repo) that reads one oversized artifact and returns a summary. `seedBuiltins` grew a `retiredBuiltinNames` list that rm's the old folder on launch, so a renamed pack does not strand the stale skill. Studio owns these forks (stamped "Verified against ask-marcel-office v2.2.0"); no doc compiler with the plugin until drift bites twice.
Applies to: any change to the built-in M365 pack or the agent's standing knowledge.

## [decision] M10: no approval dialog, so the shell guard has to be silent and rare (2026-07-21)

The app is for people who cannot judge "may I run `rm -rf ~/Documents`?", so an approval
prompt would be worse than useless: it teaches clicking yes. The guard is a PreToolUse hook
that denies a short list of irreversible shapes and says nothing to the user; the agent reads
the reason and explains it in its own words.

Two consequences worth remembering. A refusal has to be rare enough never to block ordinary
work, which is why containment (is this path inside the conversation's folder?) is the rule
rather than a blocklist of commands. And a hook denial short-circuits regardless of
`permissionMode`, which is what lets `bypassPermissions` stay (verified in sdk.d.ts 0.3.185,
line ~3736: "PreToolUse hook denies bypass canUseTool").

Accepted residual risk, stated in the module header rather than papered over: shell
redirection. `> file` truncates without naming a verb the scanner can recognise.

## [gotcha] built-in skills were re-seeded with `cp force:true` on every launch (2026-07-21)

Which meant editing one was pointless: the next start silently undid it. Fixed by recording a
sha256 of what the app last wrote (`.seed-meta.json` in the skills dir, a leading dot so
skill-name.ts can never accept it as a folder). Untouched since the last seed means an update
may replace it; changed means the user changed it. A folder with no record predates the
bookkeeping and is adopted once, then protected.

## [gotcha] the transcript lived in a keyed component, so switching conversations lost it (2026-07-21)

`<ChatPage key={activeId}>` unmounted on every switch, and the conversation file is only
written when a turn ends. Switch away mid-answer and back, and the messages were gone: the
events kept arriving but the rebuilt view had never seen their turn-start, so ui-event-fold
dropped them. Fixed by holding one transcript per conversation above the keyed page
(lib/chat-cache) with a single app-lifetime subscription.

The reconciliation rule matters: idle means the file wins (this is what swaps the optimistic
user echo for the persisted message), mid-turn means file history plus live messages the file
does not know about yet, matched by id. A new `turn-saved` event exists because `turn-done`
fires from the SDK result, BEFORE the save, so re-reading on turn-done races the write.

## [gotcha] Stryker's incremental cache reports stale survivors after a test change (2026-07-21)

Already in this file for scores you tried to improve; it bit repeatedly across M10 when
splitting commits. `rm -f reports/stryker-incremental.json` before trusting any
`mutate:staged` result on a file whose tests just changed. The pre-commit hook uses the same
cache, so a commit can fail the gate on a score the file no longer has.

## [gotcha] a missing cwd is reported by the SDK as a native-binary mismatch (2026-07-21)

The voice profile could not be built, and what the panel showed was: "Claude Code native
binary at ...-darwin-x64/claude exists but failed to launch. This usually means the binary
does not match this system's libc". The binary was fine, and this is an Intel Mac, so x64 was
right too. The real fault was `<userData>/background-workspace`, which nothing ever created.

The SDK checks `existsSync(binary)` when the spawn errors, then classifies ENOENT, EACCES,
EPERM, ENOTDIR, ELOOP, ENAMETOOLONG and EROFS as a loader problem (sdk.mjs, `nE`/`AB`). A
`cwd` that does not exist fails the spawn with ENOENT, and the message names the binary,
because the binary is the only path the SDK thinks to mention.

Reproduced in seconds against scripts/fake-anthropic.mjs with no key: run any background turn
in a directory that is not there. Conversations never hit it because a conversation's
workspace is created with the conversation; a background job belongs to no conversation, so
`background-agent-io` now creates its own working directory before it spawns.

The general form: when a spawn error names something that is obviously fine, suspect the cwd
before the executable.

## [gotcha] WebSearch is Anthropic's own tool, so off Anthropic it answers nothing (2026-07-21)

A conversation on `LVMH · deepseek-v4-pro` searched the web eight times and got eight empty
results, no error. The agent then wrote a confident answer from memory and cited a Wikipedia
page it had fetched, which made the whole thing read as a successful search.

WebSearch is not run locally. The CLI offers it in the turn as an ordinary tool (name,
description, input_schema, like Bash), and when the model calls it, executes it by making a
SECOND request to the same `ANTHROPIC_BASE_URL` carrying `{ type: 'web_search_20250305',
name: 'web_search', max_uses: 8 }` and the message "Perform a web search for the query: ...".
The real API runs that server-side tool and streams back `web_search_tool_result` blocks. Any
other endpoint has no such tool, returns none, and the CLI renders its zero-result template:
the "Web search results for query" header, then nothing, then the cite-your-sources reminder.
Not even its own "No links found." line, which needs a result block to be absent from.

Proven by pointing the vendored `claude` binary at a capture server (scratchpad, not the
repo): request 2 carried 28 typeless tools including WebSearch, request 3 carried the single
server-tool spec above. That probe also corrected the first guess, which was that the server
tool rode in the main turn's `tools` array. It does not.

WebFetch is the opposite and kept working throughout: the CLI does that HTTP itself and only
uses the model to summarise, which any provider can do.

Two consequences landed: `disallowedTools` on every turn plus a withdrawn-tools list in
`agents-doc`, and a gateway that refuses a tool spec with a `type` and no `input_schema`
instead of forwarding it as an ordinary one. The general form: when a capability silently
returns nothing on a third-party endpoint, ask whether the real API was running it for you.
