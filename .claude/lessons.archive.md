# Lessons archive (committed)

Entries retired from `.claude/LESSONS.md` by a compaction pass: tightened, merged, graduated to where their rule now lives, or no longer true. Nothing reads this file at session start; grep it when a question needs the why.

Newest first.

---

## [gotcha] 2026-09-27 | the commit-size gate counts test files toward its ten; prove partial slices in a scratch index

This sharpens the 2026-07-27 gotcha on slicing a removal consumer-first: `scripts/check-commit-size.sh` leaves tests out of the 300 lines but not out of the 10 files, since it counts every staged path, which turned a planned five-commit series into six. A file split across commits without `git add -p` works by writing the intermediate version to a scratch file, running `git hash-object -w` on it and staging it with `git update-index --cacheinfo 100644,<blob>,<path>`, which leaves the working tree whole. Before asking for approval, every slice was rebuilt cumulatively in a throwaway index (`GIT_INDEX_FILE=<scratch> git read-tree HEAD`, then the same update-index calls), and each tree was archived and typechecked the way gate 6 does. One trap on the way: in zsh `path` is the array tied to `PATH`, so a `while read -r c path src` loop emptied `PATH` and every later command was "not found".
Rule for next time: count test files when sizing a commit, and prove each partial slice compiles in a scratch index before staging the real one.
Archived 2026-09-27: merge, into the entry dated 2026-09-27 "the commit gates judge each slice alone: consumer first, dependency removal last, test files counted".

## [gotcha] `bun remove` a dependency first and every intermediate commit stops typechecking (2026-07-27)

`bun remove better-sqlite3` ran early, while the code still imported it, because dropping
the dependency felt like part of the same edit. The working tree was fine, since the file
importing it was already deleted there. Every staged tree was not: any commit whose index
still contained `sqlite-memory-store.ts` failed gate 6 with "Cannot find module
'better-sqlite3'", and that included the three unrelated office commits queued ahead of the
removal, which had nothing to do with sqlite at all. The failure points at a file the commit
does not touch, which reads as nonsense until you know.

Fixed by restoring the dependency (`git checkout HEAD -- package.json bun.lock && bun
install`), landing all nine code slices, and removing it last. Rule for next time: a
dependency removal is the LAST commit of a removal series, never the first. node_modules is
shared by every staged tree the hook builds, so uninstalling early breaks commits that
predate the change.
Archived 2026-09-27: merge, into the entry dated 2026-09-27 "the commit gates judge each slice alone: consumer first, dependency removal last, test files counted".

## [gotcha] pre-commit gate 6 typechecks the STAGED tree, so a removal must be sliced consumer-first (2026-07-27)

Splitting the ~2000-line removal of the embedding-backed memory into commits that each fit
the size gate looked like a bookkeeping exercise. It is not: gate 6 runs `tsc` over the
staged content, not the working tree, so every commit is independently verified and any
slice that deletes a module still imported by another file is rejected on the spot.

Three orderings were caught this way, each of which would have left a commit that does not
compile for `git bisect` to trip over. Deleting `sqlite-memory-store.ts` before the
composition root stopped importing it. Updating `ipc-contract.ts` while `use-memory-store.ts`
still called the api methods being removed. Deleting `fake-memory-store.ts` one commit
before `memory-store.test.ts`, which imports it.

Two slices therefore had to absorb a neighbour rather than stand alone: the main unwiring
carries `context-blocks.ts` (agent-runtime stops passing `memoryPreamble` in the same
commit), and the contract slice carries `memory-store.ts` (the contract was its last
importer). Rule for next time: slice a deletion strictly consumer-before-module, and expect
a file's last importer to pull that file into its commit. Two counting details make this
easier than it looks: `--diff-filter=ACMR` means deleted files do not count toward the
10-file limit, and `*.test.ts` lines do not count toward the 300-line limit.
Archived 2026-09-27: merge, into the entry dated 2026-09-27 "the commit gates judge each slice alone: consumer first, dependency removal last, test files counted".

## [gotcha] 2026-07-26 | mdast-util-to-markdown escapes bare `&` before a letter, every save

The rich editor (`@milkdown/crepe`, `src/renderer/src/render/markdown-editor.tsx`) serialises
through `mdast-util-to-markdown`, which escapes any `&` immediately followed by `#` or an ASCII
letter (`node_modules/mdast-util-to-markdown/lib/unsafe.js`: `{character: '&', after:
'[#A-Za-z]', inConstruct: 'phrasing'}`), guarding against the next parse reading it as the
start of a character reference like `&amp;`. Confirmed by direct repro (`remark().use(remark-
gfm)` on `"AT&T"` produced `"AT\&T"`; `"Ben & Jerry"`, space after the ampersand, was left
alone) before writing the fix, rather than guessing at the pattern. Real character references
essentially never appear in this app's prose (skill files, voice profile), so the escape was
pure noise, reappearing on every save. Fixed by reversing exactly that pattern post-serialise:
`src/renderer/src/lib/markdown-ampersands.ts`, wired into the editor's `markdownUpdated`
callback before the markdown reaches the caller.
Known narrow gap, accepted rather than engineered around: the reversal is a blind string
replace, so a fenced code block or inline code span containing a literal `\&letter` sequence
(someone typing about this exact escape, for instance) would also get unescaped. Low
likelihood given the prose use case; revisit with a proper mdast-scoped fix (an `unsafe`
override passed to the serialiser, not a post-process regex) if it ever bites.
Archived 2026-09-27: tighten, the rewrite stays in LESSONS.md under the same date and title.

## [decision] unsigned build means the app informs about updates and never installs them (2026-07-24)

There is no Apple Developer certificate for this project, so the DMG ships unsigned, and
macOS refuses to let an unsigned app silently replace itself. electron-updater and any
autoupdate flow are therefore off the table, not deferred for effort reasons.

What ships instead: a daily unauthenticated check of the GitHub releases API, a 10 second
deadline, silent degradation to the last known answer on any failure, and a dismissable
banner that links the DMG. Installing is a manual download. Two consequences bind future
work. The update path is inert until a GitHub release actually exists, since the API returns
404 for a repo with none. And the banner only appears when the published release is strictly
higher than the running version, so a release tagged at the version already installed is
correct behaviour showing nothing, not a bug.
Archived 2026-09-27: graduate, README.md:80-84 (Packaging) states it: unsigned, no silent autoupdate, a daily release check, manual install.

## [gotcha] `bun run dist` makes the lint gate hang, because eslint walks `release/` (2026-07-24)

The first commit attempted after packaging timed out twice, once at two minutes and once at
five. Nothing in the diff was slow: it was two doc files and a `package.json` field. `bun
test` finished in a second, coverage in a second, typecheck in seven. `lint:strict` never
came back.

electron-builder writes the entire packaged app into `release/`, `node_modules` and all, and
eslint's flat config ignored `out/`, `dist/` and `vendor/` but not `release/`. With no path
argument eslint lints the whole working directory, so the type-aware pass was trying to build
a program over a 295 MB app bundle. It presents as a mysterious pre-commit timeout with no
error, which is the worst possible symptom, and it only appears on the first commit after a
packaging run.

Fixed by adding `release/**` to the ignores block in `eslint.config.js`. Rule for next time:
any new build-output directory has to be added to eslint's ignores in the same change that
creates it, not the first time it bites.
Archived 2026-09-27: merge, into the entry dated 2026-07-24 "ESLint flat config ignores .gitignore, so every fetched or built folder needs its own ignores entry".

## [gotcha] 2026-07-24 | hiddenInset honours trafficLightPosition; verify chrome from the main process, not a screenshot

Folding the empty title band away needed the macOS traffic lights re-centred in the new
48px sidebar strip via a `trafficLightPosition: { x: 18, y: 18 }` constructor option. The
open question was whether `titleBarStyle: 'hiddenInset'` even honours a custom position, or
whether it silently ignores it and forces a fall back to `'hidden'`. It honours it: verified
without any OS screenshot by launching the BUILT app under Playwright and reading the real
BrowserWindow from the MAIN process with `app.evaluate(({ BrowserWindow }) => BrowserWindow
.getAllWindows()[0].getWindowButtonPosition())`, which returned `{ x: 18, y: 18 }`;
`getBounds()` equalled `getContentBounds()`, confirming the lights overlay the web contents
with no native title bar reserving space.

Two capture dead-ends that wasted time first: a Playwright `page.screenshot()` shows only the
web contents, never the OS-drawn traffic lights, so it cannot prove where they sit; and
`screencapture` grabbed only the empty desktop because the detached app window opened on a
different macOS Space, while `osascript` to read the window bounds failed with "not allowed
assistive access" (the session lacks accessibility permission and cannot grant it).

Rule for next time: to check window-chrome geometry, drive the built app with Playwright and
read the truth from the main process via `app.evaluate`, rather than trying to photograph OS
chrome. The renderer-side layout (drag regions, insets, sticky header) is separately
measurable with a `page.evaluate` returning `getBoundingClientRect` + `getComputedStyle`,
including `-webkit-app-region`.
Archived 2026-09-27: tighten, the rewrite stays in LESSONS.md under the same date and title.

## [gotcha] a pre-commit gate that reads the working tree does not guard the commit (2026-07-23)

Seven commits landed green on this branch and a clean checkout of the tip failed typecheck on
three separate errors: a port whose signature had moved, a store argument, and a page
importing a module that was never staged. Every one of them passed the hook because gate 6
ran `bun run typecheck`, which reads the WORKING TREE, and the missing halves were sitting
unstaged in it the whole time. The gate was measuring the developer's desk, not the commit.

It only surfaced because a `git worktree add --detach HEAD` was used to check the tip
independently. Nothing in the normal loop would ever have caught it: the tree is green, the
hook is green, and the break is invisible until someone clones.

The general form: a gate must run against the artefact it is gating. `scripts/check-staged-typecheck.sh`
now materialises the index with `git write-tree` + `git archive` into a temp dir and typechecks
THAT, which never touches the working tree, so there is no stash to restore if it exits early.
Rule for next time: when a commit stages a subset of the tree, verify the subset, and reach for
a detached worktree to audit HEAD before trusting a branch.
Archived 2026-09-27: graduate, scripts/check-staged-typecheck.sh:11-28 (gate 6) typechecks the staged tree materialised with `git write-tree` and `git archive`.

## [gotcha] WebSearch is Anthropic's own tool, so off Anthropic it answers nothing (2026-07-21)

A conversation on `[provider label redacted under rule 26] · deepseek-v4-pro` searched the web eight times and got eight empty
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
Archived 2026-09-27: tighten, the rewrite stays in LESSONS.md under the same date and title.

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
Archived 2026-09-27: tighten, the rewrite stays in LESSONS.md under the same date and title.

## [gotcha] Stryker's incremental cache reports stale survivors after a test change (2026-07-21)

Already in this file for scores you tried to improve; it bit repeatedly across M10 when
splitting commits. `rm -f reports/stryker-incremental.json` before trusting any
`mutate:staged` result on a file whose tests just changed. The pre-commit hook uses the same
cache, so a commit can fail the gate on a score the file no longer has.
Archived 2026-09-27: graduate, same as the 2026-07-17 entry of the same title: README.md:65-66 and scripts/mutate-staged.sh:38.

## [gotcha] built-in skills were re-seeded with `cp force:true` on every launch (2026-07-21)

Which meant editing one was pointless: the next start silently undid it. Fixed by recording a
sha256 of what the app last wrote (`.seed-meta.json` in the skills dir, a leading dot so
skill-name.ts can never accept it as a folder). Untouched since the last seed means an update
may replace it; changed means the user changed it. A folder with no record predates the
bookkeeping and is adopted once, then protected.
Archived 2026-09-27: graduate, src/shared/seed-meta.ts:3-8 states the rule (hash of what was last written: untouched may be replaced, changed stays).

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
Archived 2026-09-27: graduate, README.md:161-172 (Guardrails) states the no-dialog rule and its rarity; src/shared/bash-guard.ts:19-20 states the accepted redirection risk.

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

## [gotcha] 2026-07-20 | ESLint flat config does not honor .gitignore, so a fetched vendor/ breaks lint

`bun run fetch:python` extracts an embedded CPython into `vendor/`, which is git-ignored. `lint:strict` runs `eslint` with no path argument, and ESLint's flat config ignores `.gitignore` entirely: it linted the runtime's bundled JS (pip's vendored urllib3) and failed the commit on `no-undef` for `self`, `fetch`, `TextEncoder`. The fix is to add `vendor/**` to ESLint's own `ignores` block. bun test, coverage, typecheck (tsconfig `include` is explicit), and gitleaks (staged-only) were all unaffected; only ESLint's catch-all glob was.
Rule for next time: anything fetched into the working tree that ESLint could glob needs an entry in the ESLint `ignores`, not just `.gitignore`.
Archived 2026-09-27: merge, into the entry dated 2026-07-24 "ESLint flat config ignores .gitignore, so every fetched or built folder needs its own ignores entry".

## [decision] 2026-07-20 | embedded runtimes: node/npm reuse ELECTRON_RUN_AS_NODE, python is vendored

M8 gives the agent language runtimes with no install on the user's machine. node/npm/npx cost nothing extra: Electron IS Node under `ELECTRON_RUN_AS_NODE=1`, so a shim execs the app's own binary, and only the pure-JS `npm` package is vendored (its bin scripts run through that same binary). Python has no equivalent hiding in Electron, so it needs a real vendored runtime: a python-build-standalone `install_only` tarball (pinned by tag + sha256 in `scripts/fetch-python.ts`), extracted to a `python/` folder, plus a first-launch venv under `<userData>/py` seeded offline from bundled wheels (`pip install --no-index --find-links`). The venv is stamped with the runtime build and rebuilt when that changes, because a venv embeds its interpreter's absolute prefix and cannot survive a runtime bump. The shims (`src/shared/tool-shims.ts`) and paths (`src/shared/python-paths.ts`) are pure and platform-keyed so the Windows branch is unit-tested on macOS via `path.win32.join`.
Applies to: any future runtime the agent should carry, and the M6 packaging (extraResources runtime + wheels per target, hardened-runtime sign-walk, `disable-library-validation` entitlement).
Archived 2026-09-27: graduate, README.md:130-140 states it (node/npm/npx through ELECTRON_RUN_AS_NODE, a vendored python-build-standalone with a private venv rebuilt when the runtime changes).

## [decision] 2026-07-19 | untestable renderer wiring lives outside src/renderer/src/lib, the 100% coverage tier

M7 added a React hook (`use-conversations`) and the markdown/shiki renderer (`render/markdown`), and `bun test` can run neither: a hook needs a React runtime and react-markdown needs a DOM. `check-coverage.ts` gives `src/renderer/src/lib/` the 100% tier on the premise that everything there is pure logic the runner executes for real, so these two do not belong in it. They live in `src/renderer/src/hooks/` and `src/renderer/src/render/`, which fall into the skipped tier alongside the components. Pure, tested renderer logic (format-usage, conversation-list, ui-event-fold) stays in lib.
Rule for next time: if `bun test` cannot run a renderer module, it does not go in `src/renderer/src/lib`. See the paired gotcha below.
Archived 2026-09-27: graduate, README.md:100-101 places pure tested logic in src/lib (the 100% tier) and hooks in the skipped tier.

## [decision] 2026-07-17 | commit identity is the repo-local neutral atelier handle

The machine's global git identity is a company email ([a work email, redacted under rule 26]) and this repo is MIT-licensed and may go public, so an inherited identity would be exactly the accidental leak rule 26 exists to prevent. Set `atelier <atelier@users.noreply.github.com>` via `git config --local` at repo birth, which is the only moment the choice is free. Gate 3 (`gitleaks protect --staged`) scans the diff and is blind to the author field, so nothing else would have caught it.
Applies to: every commit in this repo.
Archived 2026-09-27: tighten, the rewrite stays in LESSONS.md under the same date and title.

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

## [gotcha] 2026-07-17 | ask-marcel-office-cli 2.2.0 is not published to npm

`docs/PLAN.md` pins the office CLI at `^2.2.0`, but the npm registry's latest is `2.1.0`. The machine's global `ask-marcel-office` is an npm symlink to the local sibling repo `../ask-marcel-office-cli` sitting at an unpublished 2.2.0, which is why the CLI works locally while the dependency would fail to resolve. The user chose to publish 2.2.0 to npm rather than use a `file:` dependency or downgrade. Blocks M4 and M6 only, not M0-M2.
Affects: the `bun add ask-marcel-office-cli` step at M4.
Archived 2026-09-27: archive, no longer true: package.json:38 depends on `ask-marcel-office-cli` `^2.6.0` from npm.

## [gotcha] 2026-07-17 | electron 43 has no postinstall, so risk R1 and trustedDependencies are obsolete

`docs/PLAN.md` R1 says bun blocks electron's postinstall and prescribes `trustedDependencies: [electron, esbuild, @tailwindcss/oxide]`. Electron 43.1.1 ships no `scripts` field at all: `index.js` lazily downloads the binary on first require and exposes a `bin: install-electron` for explicit installs, so there is no lifecycle script to block or trust. Verified independently that esbuild installs its binary with no trustedDependencies (bun default-trusts it) and that @tailwindcss/oxide uses napi optional deps rather than a postinstall, so all three entries were dead weight and were removed. The only blocked script in the tree is electron-winstaller, which is Windows-only and irrelevant to the mac target.
Affects: risk R1 in docs/PLAN.md, which should be struck.
Archived 2026-09-27: archive, done and stated: package.json carries no `trustedDependencies`, and README.md:36-37 says Electron has no postinstall.

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
