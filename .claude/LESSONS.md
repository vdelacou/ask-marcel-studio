# Lessons (committed)

Append-only institutional memory for this codebase. See the atelier skill's `references/lessons.md` for the format and rules.

Each entry is one of `[mistake]`, `[decision]`, or `[gotcha]`. Newest first.

---

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
