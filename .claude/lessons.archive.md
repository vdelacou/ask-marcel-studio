# Lessons archive (committed)

Entries retired from `.claude/LESSONS.md` by a compaction pass: tightened, merged, graduated to where their rule now lives, or no longer true. Nothing reads this file at session start; grep it when a question needs the why.

Newest first.

---

## [decision] 2026-07-20 | M365 knowledge ships as an always-on core + two trigger-split skills + a programmatic reader subagent

The single `ask-marcel-office` built-in skill was replaced (M9, grilled decision record in the git history of `.claude/PLAN.md`) by: (1) a compact always-on core appended to every turn (CLI nature, auth doctrine, routing table, ground rules, Sources footer); (2) two on-demand skills split by TRIGGER not source — `answer-from-m365` (read) and `draft-outlook-email` (write) — because the read sections co-fire on real questions while draft has disjoint triggers and safety rules; (3) `m365-reader`, a programmatic subagent (`agents` option in agent-runtime, versioned in-repo) that reads one oversized artifact and returns a summary. `seedBuiltins` grew a `retiredBuiltinNames` list that rm's the old folder on launch, so a renamed pack does not strand the stale skill. Studio owns these forks (stamped "Verified against ask-marcel-office v2.2.0"); no doc compiler with the plugin until drift bites twice.
Applies to: any change to the built-in M365 pack or the agent's standing knowledge.
Archived 2026-09-27: graduate, README.md:121-128 states the always-on core, the two trigger-split skills and the m365-reader.

## [gotcha] 2026-07-20 | settingSources: ['user'] does NOT load a CLAUDE.md; use systemPrompt append for always-on content

SDK 0.3.185 `sdk.d.ts:1820` states "Must include `'project'` to load CLAUDE.md files." The agent runs `settingSources: ['user']` (which loads the `CLAUDE_CONFIG_DIR/skills` folder, NOT a memory file), so a seeded `claude-config/CLAUDE.md` would silently never load. The M9 always-on Microsoft 365 core therefore ships via `systemPrompt: { type: 'preset', preset: 'claude_code', append: <core text> }` (`sdk.d.ts:1881`), read from `resources/agent-core/core.md` by the composition root and passed as the `corePrompt` dep. Adding `'project'` to settingSources was rejected: it would also pull any `.claude/settings.json` and `.claude/CLAUDE.md` from the per-conversation workspace cwd, which is not wanted.
Rule for next time: to inject standing instructions into every turn, use the preset `append`, not a CLAUDE.md.
Archived 2026-09-27: graduate, src/main/services/agent/agent-runtime.ts:49-54 states that settingSources: ['user'] loads no CLAUDE.md, hence the preset append.

## [gotcha] 2026-07-20 | npm re-spawns node through our own PATH shim, so `npm i -g` works offline; asar stays unverified

Verified against the real Electron binary with an empty PATH: `ELECTRON_RUN_AS_NODE=1 electron npm-cli.js --version` runs, and a full `npm install -g leftpad` succeeds with only `<userData>/bin` on PATH, landing in the data-folder prefix (`npm_config_prefix`). This works because when npm re-spawns `node` for its own steps it resolves our `node` shim, which is electron-as-node again, closing the loop. All of this ran in dev where the CLIs resolve from repo `node_modules`; the packaged case reads `npm-cli.js` and `cli.js` out of `app.asar`, which is expected to work but stays UNVERIFIED until M6 (fallback: `asarUnpack` those packages).
Applies to: the office CLI and node/npm/npx shims alike, and the M6 packaging smoke test.
Archived 2026-09-27: graduate, README.md:130-133 states the offline npm and shims; the asar question it left open is moot, electron-builder.yml:9-16 ships `asar: false`.

## [decision] 2026-07-20 | embedded runtimes: node/npm reuse ELECTRON_RUN_AS_NODE, python is vendored

M8 gives the agent language runtimes with no install on the user's machine. node/npm/npx cost nothing extra: Electron IS Node under `ELECTRON_RUN_AS_NODE=1`, so a shim execs the app's own binary, and only the pure-JS `npm` package is vendored (its bin scripts run through that same binary). Python has no equivalent hiding in Electron, so it needs a real vendored runtime: a python-build-standalone `install_only` tarball (pinned by tag + sha256 in `scripts/fetch-python.ts`), extracted to a `python/` folder, plus a first-launch venv under `<userData>/py` seeded offline from bundled wheels (`pip install --no-index --find-links`). The venv is stamped with the runtime build and rebuilt when that changes, because a venv embeds its interpreter's absolute prefix and cannot survive a runtime bump. The shims (`src/shared/tool-shims.ts`) and paths (`src/shared/python-paths.ts`) are pure and platform-keyed so the Windows branch is unit-tested on macOS via `path.win32.join`.
Applies to: any future runtime the agent should carry, and the M6 packaging (extraResources runtime + wheels per target, hardened-runtime sign-walk, `disable-library-validation` entitlement).
Archived 2026-09-27: graduate, README.md:130-140 states it (node/npm/npx through ELECTRON_RUN_AS_NODE, a vendored python-build-standalone with a private venv rebuilt when the runtime changes).

## [decision] 2026-07-19 | untestable renderer wiring lives outside src/renderer/src/lib, the 100% coverage tier

M7 added a React hook (`use-conversations`) and the markdown/shiki renderer (`render/markdown`), and `bun test` can run neither: a hook needs a React runtime and react-markdown needs a DOM. `check-coverage.ts` gives `src/renderer/src/lib/` the 100% tier on the premise that everything there is pure logic the runner executes for real, so these two do not belong in it. They live in `src/renderer/src/hooks/` and `src/renderer/src/render/`, which fall into the skipped tier alongside the components. Pure, tested renderer logic (format-usage, conversation-list, ui-event-fold) stays in lib.
Rule for next time: if `bun test` cannot run a renderer module, it does not go in `src/renderer/src/lib`. See the paired gotcha below.
Archived 2026-09-27: graduate, README.md:100-101 places pure tested logic in src/lib (the 100% tier) and hooks in the skipped tier.

## [decision] 2026-07-17 | this repo is a hybrid variant, not one of atelier's three

Electron + React matches neither the Bun-script, Next.js, nor Java variant, so the standard has no ready-made answer for it. It takes the Bun-script base (eight-gate hooks, `Result`, ESLint + SonarJS flat config) and applies the Next.js variant's rules 21-22 (logic-free design system, Tailwind sealed inside the components tree) to the renderer. Every future UI change obeys 21-22 despite there being no Next.js, and every main-process change obeys the Bun-script rules despite the runtime being Electron's Node.
Applies to: any "which variant is this?" question in this repo.
Archived 2026-09-27: graduate, CLAUDE.md:20-26 states the hybrid variant.

## [decision] 2026-07-17 | bun test covers pure modules only; electron importers are excluded

The Bun test runner has no Electron runtime, so a test that imports `electron` crashes the runner rather than failing cleanly. Pure logic therefore lives in `src/shared/**` or in named pure modules that never import electron (`session-env`, `sdk-event-fold`, the gateway translators, `skill-md`, `ui-event-fold`). This is the same pressure Clean Architecture already applies, so it costs nothing to obey. The generated coverage preload must never force-import an electron-importing file, or `bun run coverage` dies at import time.
Rule for next time: if it needs a unit test, it must not import electron.
Archived 2026-09-27: graduate, CLAUDE.md:37-39 and README.md:282-285 state that bun test covers pure modules only.

## [decision] 2026-07-17 | coverage tiers and Stryker globs retuned for the shared/main/preload/renderer layout

The shipped `check-coverage.ts` and `stryker.conf.json` hardcode `src/domain/**` and `src/use-cases/**`, which this Electron layout does not have. Both files ship with an explicit "tune per-project" comment, so retuning them to `src/shared/**` is sanctioned configuration rather than a deviation. `src/shared/**` carries the 100% tier because it is the only tier guaranteed free of electron imports.
Applies to: any new pure module that should be gate-enforced.
Archived 2026-09-27: graduate, scripts/check-coverage.ts:86-94 (COVERAGE_RULES) and stryker.conf.json:11-14 (mutate glob) carry the retuned tiers.

## [gotcha] 2026-07-17 | "type": "module" makes electron-vite emit the preload as .mjs

The upstream electron-vite scaffold writes `preload: join(__dirname, '../preload/index.js')` and works, because that scaffold's package.json has no `type` field and is therefore CJS. Hard rule 9 requires `"type": "module"`, which flips electron-vite's preload output to `index.mjs` and leaves the scaffold's `.js` path silently unresolvable, so the contextBridge never runs and the renderer sees no global. Loading an ESM preload also requires `sandbox: false`. The build succeeds and typecheck passes either way, so only launching the app catches it.
Applies to: any change to the preload path or the package `type` field.
Archived 2026-09-27: graduate, src/main/index.ts:91-95 states the index.mjs preload path and `sandbox: false`.

## [gotcha] 2026-07-17 | Stryker's incremental cache reports stale survivors after a test change

Two mutants kept showing as survived in `src/shared/model-ref.ts` after assertions were added that provably kill them. The cause is `incremental: true` plus `incrementalFile: reports/stryker-incremental.json` in the shipped stryker.conf.json, which reused the previous run's verdicts instead of re-evaluating. Deleting the incremental file and rerunning took the score from 95.92% to 100%. A green mutation gate can therefore be a lie right after tests change.
Rule for next time: delete reports/stryker-incremental.json before trusting a mutation score you just tried to improve.
Archived 2026-09-27: graduate, README.md:65-66 states it and scripts/mutate-staged.sh:38 clears the cache before every gate run.

## [gotcha] 2026-07-17 | the dev machine is Intel x64 but docs/PLAN.md M6 targets a mac arm64 DMG

`uname -m` reports x86_64 on a Core i9-9880H with no Rosetta translation and no arm64 hardware, so every native artifact resolved here is darwin-x64 (`@tailwindcss/oxide-darwin-x64` is what installed). M6 asks for a mac arm64 DMG plus a smoke test on a Node-less account, and risk R2 names the `@anthropic-ai/claude-agent-sdk-darwin-arm64` binary specifically. Cross-building arm64 from x64 is possible with electron-builder, but the arm64 smoke test needs real Apple Silicon hardware. Unresolved: confirm the intended target arch before M6.
Affects: M6 packaging only.
Archived 2026-09-27: graduate, README.md:85-86 settles it: x64 only, arm64 needs real Apple Silicon.

## [gotcha] 2026-07-17 | electron 43 defers a 124MB download to the first require

Because Electron 43 has no postinstall, `bun install` finishes in seconds and the ~124MB binary downloads on the first `require('electron')` instead, measured at roughly two minutes cold. It fires on the first `bun run dev` rather than at install time, which is survivable but surprising. `bun test` never triggers it as long as no test imports electron, which the layout already guarantees. `ELECTRON_SKIP_BINARY_DOWNLOAD` no longer exists in 43, so the old CI trick to suppress it is gone; a root `"postinstall": "install-electron"` is the lever if the download ever needs to be deterministic.
Applies to: first-run experience and any future CI image build.
Archived 2026-09-27: graduate, README.md:36-38 states the lazy ~124MB Electron download on the first `bun run dev`.

## [gotcha] 2026-07-17 | Stryker needs real node on PATH and bun run hides that it does

Gate 8 runs `bun run mutate:staged`, which passes only because `bun run` delegates a `#!/usr/bin/env node` shim to the real node binary when node is on PATH. Under Bun's own runtime Stryker dies in its Babel instrumenter with "generator is not a function", and `bun run` silently falls back to Bun when node is absent instead of failing loudly, so this breaks only on a machine or CI image without node. Also note `packageManager` in stryker.conf.json must stay `"npm"`: the schema enum is npm/yarn/pnpm only and `"bun"` is a hard ConfigError.
Affects: any CI image for this repo, which must install node even though the toolchain is Bun.
Archived 2026-09-27: graduate, README.md:31-33 states that node must be on PATH for Stryker.

## [gotcha] 2026-07-17 | a lint rule that never fires looks identical to a lint rule that passes

Both the rule 21 and rule 22 blocks are enforced only by ESLint, and every failure mode of a flat config (misregistered plugin, non-matching `files` glob, a REPLACE collision) fails OPEN: the rule silently stops existing and the run reports success. Green lint is therefore not evidence the design-system seal works. The only proof is a smoke test: write a file that deliberately violates each rule, confirm ESLint rejects it, then delete it. Doing this caught a real hole in the rule 22 globs that had been reporting clean.
Rule for next time: after touching eslint.config.js, prove each new rule fires with a throwaway violating file before trusting a green run.
Archived 2026-09-27: graduate, the atelier standard CLAUDE.md:3-6 binds states it ("every gate proves it can fail": land a violation fixture per gate).

## [decision] 2026-07-17 | stores split into a pure core plus a thin IO shell

Store modules are main-process IO, so under the retuned COVERAGE_RULES they fall in the skipped "electron surface" tier and would carry no coverage or mutation gate at all. Each store therefore splits into a pure module under `src/shared/` holding the parse, validate and merge logic (100% tier, inside the Stryker glob) and a thin electron-side shell that only reads and writes bytes. This is the same pressure Clean Architecture already applies and it is what makes the M2 event folds testable, so it costs one extra file per store and buys back the gate.
Applies to: settings-store, conversations-store, and every later module that mixes logic with electron IO.
Archived 2026-09-27: graduate, CLAUDE.md:37-39 and README.md:266-278 state the pure-core plus IO-shell split.

## [decision] 2026-07-17 | provider API keys are encrypted at rest with Electron safeStorage

`docs/PLAN.md` types `Provider.apiKey` as a plain `string` in `settings.json` under `userData`, which for a single-user local app is defensible but leaves a real secret readable in a plaintext file. The user chose `safeStorage` (macOS Keychain-backed) over plaintext, so the key is encrypted before write and decrypted on read. The encryption lives in the store's IO shell and never in its pure core, which keeps electron out of `src/shared/**` and out of the 100% coverage tier. This forks `Provider` into a stored shape carrying an opaque `{ enc }` envelope and a runtime shape carrying the plaintext string, and the shell must return a typed err when `safeStorage.isEncryptionAvailable()` is false rather than throwing.
Applies to: the Provider type, the settings store, and any future secret this app persists.
Archived 2026-09-27: graduate, README.md:266-278 ("How a setting reaches disk") and settings-store.ts:1-14 state the safeStorage sealing.

## [gotcha] 2026-07-17 | a branded type is a compile-time proof and does not survive IPC

`RenameConversationInput.id` was typed as the branded `ConversationId`, which typechecked and looked safe but was a lie: a brand is erased at runtime, and anything crossing IPC is JSON, so whatever the renderer sends arrives in main as an untrusted plain string. Typing an IPC payload as branded claims a validation that has not happened and invites a caller to skip the checkpoint. Every id entering main over IPC is therefore typed `string` and re-branded at the boundary via `conversationId()`; the same applies to any future branded value on the wire.
Rule for next time: brands stop at the process boundary — re-validate on arrival, never type the wire as branded.
Archived 2026-09-27: graduate, src/main/ipc/register.ts:9-10 states that every id is re-branded at the boundary.

## [mistake] 2026-07-17 | main validated the api key but stored the untrimmed one

`validateSettings` rejected a blank key with `apiKey.trim().length === 0` and then stored the raw `apiKey`, so a key pasted with a trailing newline was encrypted verbatim and would have been sent to the provider, returning a 401 that reads like a bad key. Every unit test passed because the renderer's `draftsToSettings` trims first, so no test ever handed main an untrimmed key; only driving the real app and calling `studio.settings.save()` directly exposed it. Main is the authoritative validator and must never depend on the caller having normalised its input.
Rule for next time: when a validator checks `x.trim()`, it must store `x.trim()` — and test the boundary directly, not through the layer that already cleans the input.
Archived 2026-09-27: graduate, src/shared/settings-doc.ts:142-145 states the store-the-trimmed-key rule and that main must not trust the caller.

## [gotcha] 2026-07-17 | query.interrupt() silently no-ops with a string prompt; cancel must use abortController

`docs/PLAN.md` specifies cancel via `query.interrupt()`, and the method does exist on the Query type in 0.3.185, so it typechecks. But the SDK documents control requests as "only supported when streaming input/output is used", and the runtime honours that by doing nothing rather than complaining: probed against a hanging local server with a string prompt, `interrupt()` RESOLVED while the generator kept running and kept emitting. A silent success is the worst failure mode, since nothing surfaces it. `Options.abortController` is the mechanism that actually works: it stops the query, emission ceases, and the generator throws `Claude Code process aborted by user`, which the runtime must recognise as a user cancel rather than report as an error.
Applies to: the M2 agent runtime's cancel path, and any later use of setPermissionMode or setModel, which are control requests with the same constraint.
Archived 2026-09-27: graduate, src/main/services/agent/agent-runtime.ts:8-10 states the abortController rule and the interrupt() no-op.

## [decision] 2026-07-17 | M2 is verified against a fake Anthropic endpoint, not a live key

`docs/PLAN.md` gates M2's definition of done on a live Anthropic key, which the agent does not have. `scripts/fake-anthropic.mjs` speaks the real SSE wire protocol instead (message_start, content_block_delta, tool_use with input_json_delta, message_delta, message_stop), so everything except the model itself is real: real SDK, real agent subprocess, real tool execution, real IPC, real renderer. It proved the whole path, including the agent genuinely running `echo MARCEL_WAS_HERE` and the output coming back into a tool card. Keep it for M5, where the gateway has to emit exactly this wire format.
Applies to: verifying any turn-shaped behaviour without spending a key.
Archived 2026-09-27: graduate, README.md:249-264 ("Trying it without an API key") documents scripts/fake-anthropic.mjs and scripts/fake-openai.mjs.

## [gotcha] 2026-07-17 | noUncheckedIndexedAccess was off, so the types lied about array access

`lint:strict` flagged `providers[0] === undefined` as "always false", which looked like dead code but was the opposite: without `noUncheckedIndexedAccess`, TypeScript types every index access as present, so `providers[0]` on an EMPTY array is typed `Provider` while returning `undefined` at runtime. The defensive checks were correct and the type system was wrong. Neither `strict: true` nor `@electron-toolkit/tsconfig` enables the flag, so it was silently off from M0. Turning it on in both tsconfigs produced zero new errors, because the code already guarded every index access.
Applies to: both tsconfigs; keep the flag on, and read an "always false" comparison as a possible missing flag before deleting the check.
Archived 2026-09-27: graduate, tsconfig.node.json:7 and tsconfig.web.json:7 set `noUncheckedIndexedAccess: true`.

## [decision] 2026-07-17 | risk R7 confirmed: a new skill applies on the next message, no hot reload needed

`docs/PLAN.md` assumes a fresh SDK process per turn means an added skill is picked up on the next message. Confirmed by capturing the agent's actual API request: a skill copied into `claude-config/skills` after launch appears in the very next turn's payload, with no restart. So the panel needs no reload machinery and no restart prompt. Verified by planting a marker string in the skill's description and grepping the captured request body.
Applies to: the skills panel, which can stay stateless.
Archived 2026-09-27: graduate, README.md:118-119 states that a skill applies from the next message.

## [gotcha] 2026-07-17 | CLAUDE_CONFIG_DIR isolates the user's own skills, but the SDK's built-ins still load

Verified by capturing what the agent actually sends: with `CLAUDE_CONFIG_DIR` pointed at userData and `settingSources: ['user']`, none of the developer's personal `~/.claude` skills reach the app's agent, while both of the app's own do. The list the model sees is NOT only ours, though: `systemPrompt: { preset: 'claude_code' }` also brings the SDK's bundled skills (code-review, verify, run, deep-research and friends). That is expected rather than a leak, but it means the agent in this app can reach for tools the product never advertised, and the skills panel will not list them.
Applies to: any future claim that the app controls exactly which skills the agent has.
Archived 2026-09-27: graduate, README.md:142-144 states that the SDK bundled skills load and personal ~/.claude skills do not.

## [gotcha] 2026-07-17 | query's `model` option overrides ANTHROPIC_MODEL, so the gateway needs the full reference twice

session-env correctly set `ANTHROPIC_MODEL=lmstudio::qwen2.5` for the gateway path, but the turn still failed with "an issue with the selected model (qwen2.5)": agent-runtime passed the BARE model id as `query({ options: { model } })`, and that option wins over the env var. The gateway then could not parse a providerId out of it and 404'd. Both the env var and the query option must carry `providerId::modelId` when routing through the gateway, and the bare id when talking to Anthropic directly.
Applies to: any future option that also exists as an ANTHROPIC_* env var.
Archived 2026-09-27: graduate, src/main/services/agent/agent-runtime.ts:149-153 states that the `model` option overrides ANTHROPIC_MODEL and why the gateway needs the full reference.
