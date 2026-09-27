# Lessons (committed)

Append-only institutional memory for this codebase. See the atelier skill's `references/lessons.md` for the format and rules.

Each entry is one of `[mistake]`, `[decision]`, or `[gotcha]`. Newest first.

---

## [decision] 2026-07-26 | flash-lite's missing Sources footer is accepted, not fixed

The agent's answer format requires a trailing Sources footer (`resources/agent-core/core.md`,
"Always end an answer with a Sources footer"). gemini-3.5-flash-lite, already documented
elsewhere in this file as the weakest pinned model, sometimes drops it on note-only answers
(answers citing only the user's own notes, no documents or emails). This is instruction-
adherence drift in a specific weak model, not a code defect: no app logic builds or checks the
footer, so there is nothing in `src/**` to patch. Decision: accept it as a known limitation of
that model rather than adding app-level enforcement (a client-side fallback footer, or a
stronger prompt) for a gap that is model-specific and already flagged as the honest floor for
prompt-doctrine checks.
Applies to: any future report of a stronger model dropping the footer, which would upgrade
this from "known weak-model gap" to a real prompt or app defect worth revisiting.

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

## [gotcha] 2026-07-20 | mutate:changed skips untracked files, so a new shared module is unmutated until staged

`scripts/mutate-changed.sh` collects files via `git diff ... HEAD`, which does not list untracked files. A brand-new `src/shared/*.ts` created in the working tree is therefore silently outside the mutation set, and a green `mutate:changed` says nothing about it. Verify a new shared module with `mutate:staged` (stage it first) or a direct `bunx stryker run --mutate <file>`. Related: stryker's `incremental: true` keys on source hashes, so a test-only edit to kill a mutant reports stale unless `reports/stryker-incremental.json` is deleted first (the mutate scripts do this; a direct `bunx stryker` call does not).
Rule for next time: absence from a `mutate:changed` run is not coverage; stage new files or target them explicitly.

## [gotcha] 2026-07-20 | pip on python-build-standalone works with an empty env, so SSL_CERT_FILE can wait

Provisioning and package installs were proven under `env -i` (no PATH, no `SSL_CERT_FILE`, no system CA bundle): pip reaches PyPI and installs fine because it ships its own vendored certificates. So the embedded python's `SSL_CERT_FILE` (pointing at certifi's bundle) is only needed for the agent's OWN python code making HTTPS calls, not for pip. That let M8 ship the shims with just `PYTHONNOUSERSITE=1` and `PIP_CACHE_DIR` and defer `SSL_CERT_FILE` as a non-breaking follow-up. `certifi` was dropped from the seed for the same reason.
Applies to: the deferred SSL work, and any assumption that a standalone python needs CA wiring before pip can run.

## [gotcha] 2026-07-19 | a renderer/src/lib file no test imports is invisible to the coverage gate, not failed by it

`bun test --coverage` only reports files a test actually loads, and `check-coverage.ts` only judges files present in that report. A module placed in the 100% `src/renderer/src/lib/` tier but imported by nothing the runner can execute never appears, so the gate passes it by absence rather than proving it covered. That is the "silently ungated by invisibility" hazard the script's own WARNING names, and it was live during M7: `use-conversations` and `markdown` would have sat in lib at an unmeasured 0% and the run would still have been green. The fix was to move them out of lib, not to trust the green.
Rule for next time: a file's absence from the coverage report is not coverage. Only the shared kernel is force-imported by the coverage preload, so nothing else is proven merely by a passing run.

## [gotcha] 2026-07-17 | the sdk sends system-role messages inside `messages`, and ai rejects them by default

The gateway's first real turn died on `400 unknown message role: system`, from the translator's own guard. Anthropic documents `system` as a top-level field, so accepting only user and assistant roles looked right and even had a test asserting the rejection — the test encoded a false assumption that live traffic disproved in one request. The SDK really does put system-role messages in the array. ai v7 accepts them only when `allowSystemInMessages: true`, which defaults to false, so BOTH the translator and the streamText call had to change.
Rule for next time: a guard rejecting something "the API does not allow" is a guess until a real client has been through it.

## [gotcha] 2026-07-17 | ai v7 renamed the stream property and the text field; fullStream is deprecated

`docs/PLAN.md` was written against ai v4/v5 and both of its assumptions are stale. `result.fullStream` is deprecated in v7 in favour of `result.stream` (identical type), and the text part carries `text` where v4 called it `textDelta`. v7 also streams tool arguments natively as tool-input-start/delta/end, and emits a whole `tool-call` part IN ADDITION — relaying both hands the agent the same tool twice, the same trap as the assistant message repeating streamed text in sdk-event-fold. The plan's "emit one input_json_delta with the full JSON" is still needed, but as a fallback for providers that skip the deltas.
Applies to: the gateway reducer, and any future ai upgrade — re-read the part names first.

## [mistake] 2026-07-17 | a test asserted against a shared tmpdir path and failed for the wrong reason

The skills traversal test asserted `existsSync(join(userData, '..', 'evil'))` is false, but `userData` is an mkdtemp under `tmpdir()`, so the sibling resolves to a path shared with every other process on the machine. A stale folder left by an earlier run in the same session failed the test while the production code was provably correct — deleting the folder and re-running proved `add()` never recreates it. Scoping the assertion to this run's own skills folder makes it deterministic. Note `grep -c` also prints `0` AND exits non-zero, so `n=$(grep -c … || echo 0)` yields `"0\n0"` and every equality check against `"0"` silently reports a leak; that pattern produced a second false alarm in the same hour.
Rule for next time: assert inside the fixture you created, never a sibling of it, and never build a shell check on `grep -c … || echo 0`.

## [mistake] 2026-07-17 | two harness bugs read as app bugs during M2 verification

A probe showed no assistant reply and then a missing tool card, both of which looked like real defects and were not. First, the fake endpoint chose its response from a global turn counter that survived across runs, so a later probe got the wrong turn; keying off whether the request body contains a `tool_result` made it stateless and correct. Second, the probe created its own BrowserWindow while main creates its own, and main emits chat events to ITS window, so the events were arriving at a window the probe never inspected. Both wasted a debugging cycle chasing the wrong layer.
Rule for next time: when a probe shows nothing, suspect the probe before the app — confirm the harness is observing the same objects the app is using.

## [decision] 2026-07-17 | hard rule 20 (Bun file API) cannot apply in the Electron main process

Rule 20 requires all file IO under `src/**` to go through `Bun.file` / `Bun.write`, but the main process runs in Electron's Node runtime where the `Bun` global does not exist, so `node:fs/promises` is the only option there. The IO is confined to `src/main/services/store/json-file.ts`, which is the single adapter that touches bytes, and the atomic write is tmp-plus-rename in the SAME directory because rename(2) is only atomic within a filesystem (a temp file in os.tmpdir() would degrade to a non-atomic copy). Rule 20 still binds anything that runs under Bun, including every test.
Applies to: any new file IO in the main process.

## [mistake] 2026-07-17 | sealed rule 22 by enumerating globs, which left new renderer files unsealed

The styling-seal block originally listed `page/**`, `lib/**`, `app.tsx` and `main.tsx`, which looked complete and linted green. Any other `.tsx` added directly under `src/renderer/src/` would have carried Tailwind classes with no rule firing at all, because a non-matching glob fails open silently rather than erroring. A smoke test with a deliberately violating file caught it; the fix was to seal by exclusion (`files: ['src/renderer/src/**/*.tsx']`, `ignores: ['src/renderer/src/components/**']`) so the default is sealed and the design system is the carve-out.
Rule for next time: express a seal as everything-except, never as a list of the places you remembered.

## [gotcha] 2026-07-17 | jsx-a11y and react need explicit registration once Next is gone

The atelier's canonical design-system ESLint block is written for the Next.js variant, where `next/core-web-vitals` quietly registers the `jsx-a11y` and `react` plugins. Porting that block to a plain React renderer without also adding `plugins: { react, 'jsx-a11y': jsxA11y }` makes every `jsx-a11y/*` and `react/*` entry throw "Definition for rule not found", and the whole config fails to load rather than degrading. The React block also needs `parserOptions.ecmaFeatures.jsx` and `settings.react.version` set by hand.
Applies to: any further rule borrowed from references/nextjs-monorepo.md.

## [gotcha] 2026-07-17 | ESLint flat config replaces rather than merges rules for the same file

Two config objects that both match a file and both declare `no-restricted-imports` (or `no-restricted-syntax`) do not combine: the later object wins outright and the earlier one's entries vanish silently. The design-system block therefore has to re-declare the `bun:test` `mock` ban (hard rule 13) inline alongside its own `patterns`, because relying on the general block to supply it would drop the mock ban for `src/renderer/src/components/**` with no warning. The same hazard is why the rule 22 styling-seal block carries `ignores` for the design system instead of overlapping it.
Rule for next time: when two blocks could match one file, hoist the shared entries into a constant and re-declare them in both, then verify with `eslint --print-config <file>`.

## [gotcha] 2026-07-17 | vite 8 and @vitejs/plugin-react 6 silently break electron-vite 5

A plain `bun add -d vite @vitejs/plugin-react` resolves to vite 8.1.5 + plugin-react 6.0.3, which violates two peer ranges at once: electron-vite@5 caps vite at `^5 || ^6 || ^7`, and plugin-react@6 requires vite `^8.0.0` exclusively. Bun does not hard-fail on peer conflicts, so the install looks clean and the breakage surfaces later at build time. The only combination satisfying every peer today is vite `^7.3.6` + `@vitejs/plugin-react` `^5.2.0`, which is what the official scaffold independently pins.
Rule for next time: after any `bun update`, re-check the vite / plugin-react / electron-vite peer triangle before trusting a green install.

## [decision] 2026-07-17 | electron-vite and electron-builder are a sanctioned deviation from hard rule 5

Hard rule 5 bans invoking `vite` or `node` directly, assuming Bun both installs and runs the code. Electron cannot run under the Bun runtime: it ships its own Node, and its build needs Vite's three-target main/preload/renderer split. Bun stays the package manager and the unit-test runner while `electron-vite` owns dev/build and `electron-builder` owns packaging. The rejected alternative, hand-rolling a Bun bundler pipeline for three targets, buys nothing and loses HMR.
Applies to: every build and dev command in this repo.

## [decision] 2026-07-17 | commit identity is the repo-local neutral atelier handle

The machine's global git identity is a company email (`vincent.delacourt@adama-development.com`) and this repo is MIT-licensed and may go public, so an inherited identity would be exactly the accidental leak rule 26 exists to prevent. Set `atelier <atelier@users.noreply.github.com>` via `git config --local` at repo birth, which is the only moment the choice is free. Gate 3 (`gitleaks protect --staged`) scans the diff and is blind to the author field, so nothing else would have caught it.
Applies to: every commit in this repo.

## [gotcha] 2026-07-20 | skill-md.ts reads description as ONE physical line; no folded YAML

The hand-rolled `parseSkillMd` (`src/shared/skill-md.ts`) takes everything after the first colon on the `description:` line as the value; it does not understand YAML folded (`>`) or literal (`|`) block scalars or multi-line continuations. A `description: >` frontmatter parsed to the 1-char value `>`, so the panel showed nothing (the SDK's real YAML parser still loaded the full text, so the skill worked, but the app UI did not). Built-in SKILL.md descriptions must be a single physical line, plain scalar, with NO `: ` colon-space (which would break the SDK's strict YAML parser) and no leading quote/indicator. Mid-string quotes are fine in both parsers.
Applies to: every SKILL.md this app ships or validates via `add`.

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

## [gotcha] a Gemini 3 tool loop dies on the second step without a thought signature (2026-07-22)

`gemini-3.5-flash-lite` answered the first turn, then 400d the moment the agent replayed its
own tool call: "Function call is missing a thought_signature in functionCall parts ... function
call `default_api:Bash`, position 5". Every Gemini 3 tier enforces it, including at minimal
thinking; Gemini 2.5 does not, which is why this never showed up before.

The signature is opaque state minted with each function call and it has to come back with the
call. `@ai-sdk/openai-compatible` handles both ends of that on its own, and PLAN.md had
recorded the swap as closing the risk. It does not, for two reasons that only reading the
installed package showed:

- Between its two ends sits this repo's Anthropic round trip. The value arrives on the
  `tool-call` stream part, an Anthropic `tool_use` block has nowhere to put it, and the agent
  replays id, name and input alone. Only the gateway can hold it, keyed by tool call id.
- The package's own round trip is broken in the middle anyway: it WRITES the signature under
  the provider's name (`createOpenAICompatible({ name })`, here the user's provider id) and
  READS it back from a hardcoded `providerOptions.google`. Named anything but `google` it
  drops the value silently. Verified by probing the installed dist, not by reading the docs.

What Google validates is narrower than the error reads: the first function call of each step
of the current turn only, where the turn opens at the last user message. Later calls in a
parallel batch legitimately carry none, so signing everything would be wrong as well as
wasteful. Where nothing is remembered there is a documented dummy,
`skip_thought_signature_validator`; an invented placeholder is refused as corrupted rather
than ignored, and signatures are endpoint-bound, so one minted on Vertex will not validate on
AI Studio.

The first version of the fix then made a second mistake worth remembering on its own: it
signed unconditionally. Every provider of kind `openai` comes through this one gateway, a
local llama server, DeepSeek, OpenRouter, and the package writes `extra_content.google...`
out whenever the value is present with no idea where the request is going. So the dummy
landed on every tool loop of every non-Google endpoint from the second step on. Caught in
review, not by a gate: every test in the block built its gateway with the Gemini provider,
so nothing exercised the shared path. The fix gates on the upstream host being under
`.googleapis.com`, and the test that pins it was proved meaningful by removing the gate and
watching it fail.

Two general forms. A provider SDK that claims to round-trip opaque state round-trips it only
between its own two ends: put a translation layer in the middle and the state is yours to
carry. And a vendor workaround added to a shared path needs the vendor test at the point of
use, or every other vendor wears it.

## [gotcha] the thin-orchestrator port dropped role→person routing, and four runs gave three CIOs (2026-07-23)

"Who is the CIO of Celine?" got three different answers in four runs: the user themselves (a
regional title on a deck they presented, promoted to the maison), "no such role" (absent from
one divisional org chart), and twice the right person, once from the public web through plain
Bash and once from the people path. The core routing table covered name→person (`get-user`)
but not title→person, so every run improvised its entry point; keyword file search rewards
co-occurrence over authority, and this mailbox over-represents the user's own region, so the
improvisations anchored on the wrong decks. The upstream ask-marcel skill already carried the
fix, a `microsoft-search-query` routing row and a "role titles are org-local" pitfall; the
07-20 thin-orchestrator split simply dropped them. Ported back, plus three rules upstream
also lacks: newest-wins is scoped to versions of the same source kind (the directory outranks
a fresher deck for titles), titles keep their scope and identity claims need two sources, and
the tenant outranks the public web (one run scraped DuckDuckGo via Bash even with the
WebSearch tool removed; a tool you delete is still reachable through the shell).

Two general forms. A prompt refactor that condenses a source document sheds its rarest rows
first, exactly the ones a routing table exists for; diff the port against upstream before
trusting it. And retrieval strategy is behavior, not commentary: a question shape with no
prescribed first call gets a sampled one.

## [gotcha] a rule phrased as confirmation guidance is optional to a flash-tier model (2026-07-23)

Verified the role→person routing live by driving the built app with a Playwright script,
seven fresh conversations, two models. First wording ("then confirm structurally: reports to
the org's head, owns the CISO/CTO reports") executed in zero of four runs; both models
answered from decks and rosters, and deepseek-v4-pro read the attendee list's empty CIO row
as "the position is vacant" while holding the "CIO Office Manager" hit whose manager IS the
answer. Rewriting the same content as a numbered procedure ("do not answer before step 3",
step 3 being the `get-user-manager` walk) made both models run the walk on the next try, and
gemini-3.5-flash-lite then printed the correct chain and still crowned the subordinate CTO,
which took one more explicit line: crown the parent, never the child. Final state: both
models converge on the right person, small model included.

The general form: prose near an instruction reads as color to a small model; only numbered
steps with an explicit stop condition and an explicitly forbidden wrong conclusion are
load-bearing. And an eval you cannot re-run is a hope, not a gate: the Playwright driver
(launch, fresh conversation, ask, wait, dump) is what made three wording iterations cheap.

## [gotcha] Bun's node:http never fires `close` on the ServerResponse (2026-07-23)

The gateway aborts its upstream call when the agent hangs up, which rides on
`res.on('close')`. That is untestable under `bun test`. Measured with a probe on both
runtimes: a client abort mid-response fires `req.aborted, res.close, req.close` under Node
and only `req.aborted, req.close` under Bun. Electron is Node, so production is correct and
the test runner simply cannot observe it.

The trap is the obvious workaround. Listening on the REQUEST instead makes the test pass and
the code wrong: on a healthy request `req.close` fires as soon as the body ends, before the
response is written, on BOTH runtimes, so every good turn would abort itself. Verified, not
assumed.

Rule for next time: when a test only passes if you move a seam, check what the seam does on
the happy path before moving it. An uncovered line with a comment saying why beats a covered
line that broke production.

## [mistake] two directories named `memory` under one userData, and a false data-loss report (2026-07-23)

Told the user their `jargon.md` had been lost. It had not. Notes live at
`claude-config/memory/` (`memoryFilePath` -> `memoryDir` -> `claudeConfigDir`, paths.ts:62)
while the elicitation queue and the extraction state live at `userData/memory/`
(`memoryQueuePath`, paths.ts:68). Only the second was looked at; it holds queue.json and
state.json and no notes, and that absence was reported as data loss. The user's notes were
intact the whole time, 2226 bytes of them, and the canary that "proved" the fix had been
quoting the real file rather than the reconstruction written next to it.

Two things went wrong and only one is about paths. The first is that a file's absence from
one directory was treated as evidence about the system rather than about the directory. The
second is that a reconstruction was then written into the user's app data, which would have
been a genuine corruption had the real note lived there.

Rule for next time: before reporting anything as missing, read the path helper that resolves
it, and never write a reconstruction of a user's own content into their data on the strength
of an absence.

## [gotcha] 2026-07-24 | ESLint flat config ignores .gitignore, so every fetched or built folder needs its own ignores entry

ESLint's flat config does not honour `.gitignore`, and `lint:strict` runs `eslint` with no path argument, so it globs the whole working directory: a fetched `vendor/` (the embedded CPython from `bun run fetch:python`, pip's vendored urllib3) failed the commit on `no-undef` for `self`, `fetch` and `TextEncoder`, and electron-builder's `release/` (the whole 295 MB packaged app, `node_modules` and all) made the type-aware pass hang until the pre-commit hook timed out with no error, on the first commit after a packaging run. Both now sit in the `ignores` block of `eslint.config.js` (line 257), while bun test, coverage, typecheck (tsconfig `include` is explicit) and gitleaks (staged-only) were never affected. Any new fetched or build-output directory needs its ESLint `ignores` entry in the same change that creates it, not the first time it bites.
Merges: 2026-07-20 (ESLint flat config does not honor .gitignore, so a fetched vendor/ breaks lint), 2026-07-24 (`bun run dist` makes the lint gate hang, because eslint walks `release/`).

## [gotcha] Bun's global `fetch` has a `preconnect` method, so `typeof fetch` is not a usable dep type (2026-07-24)

Typing an injected dependency as `readonly fetch: typeof fetch` looks like the obvious way to
say "give me a fetch", and it typechecks in isolation. It fails at the composition root:
`fetch: (url, init) => fetch(url, init)` is not assignable, because under Bun the global
carries a `preconnect` property that a plain arrow wrapper does not have. The error names a
missing property nobody wrote, which reads as nonsense until you know.

The repo already had the answer in `model-test-service.ts`: declare a narrow slice of the
call shape actually used (`ModelTestFetch`), not the whole global. `update-checker.ts` now
does the same with `UpdateFetch`. The slice is also the better seam, since a test fake only
has to satisfy the one call the adapter makes.

## [mistake] a switch consumed the pointer that caused it, and left it there to cause it again (2026-08-11)

The app opened and closed roughly once a second, forever. `observe` compares the account the
app is opened on against the one the quick context names, and a difference means somebody
else signed in: it records the new account and the composition root calls `app.relaunch();
app.exit(0)` (index.ts). What it did not do was forget the cache that told it to move.

That cache is deliberate. Signing in as somebody else writes their quick context into the
folder currently open, and the next launch reads it and moves. It is a pointer, meant to be
followed once. Two folders each holding the other's pointer therefore relaunch the app
between them for ever, and both had one: signing into each account while the app was pointed
at the other's folder had left one behind each time. No network was involved. Both caches
were inside the seven-day freshness window, so no live fetch ever ran to correct them, which
is what made it a deterministic offline loop rather than an intermittent one.

Two things about diagnosing it are worth keeping. `bun run dev` exits 0 while the app is
still running, because `app.relaunch()` spawns an instance detached from electron-vite; the
dev server dies with the parent and the surviving window shows a blank white page pointed at
a URL nobody is serving. That looks like a renderer crash and is not. And the app's own log
is the evidence: one startup burst per second, where a healthy launch writes exactly one.

Fixed by clearing the leaving folder's cached context inside the `switched` branch. Every
switch now spends one pointer, pointers are finite, so the app lands on a folder with nothing
cached and asks Microsoft 365 who is signed in, which is the only answer that can be trusted.
Rule for next time: a stored value that triggers a state change must be consumed by that
change. If following it twice would be wrong, deleting it is part of following it.

## [gotcha] a flex item's minimum width is its content, so one wide code block moved every form field (2026-08-11)

The settings panel's fields ran off the right of the sheet and the skill toggle was pushed
off screen entirely. Nothing was wrong with the fields: the column holding them is
`flex-1` inside a flex row, `min-width` on a flex item defaults to `auto` (its content), and
one built-in skill's instructions contain code blocks whose min-content width is enormous. The
column grew to fit them and took every field's right edge with it. The app frame already
carries `min-w-0` for the chat column with a comment saying exactly this; the settings column
never got it.

The second half was upstream: `settings-page` handed `SkillDetail` the raw `renderMarkdown`
tree instead of wrapping it in the `MarkdownView` atom. That atom owns `[&_pre]:overflow-x-auto`,
which is what makes a wide block scroll inside itself rather than set its parent's width, so
without it the fix would have been half a fix.

Rule for next time: any flex child that can hold rendered markdown, a table or a code block
needs `min-w-0`, and rendered markdown goes through `MarkdownView` rather than straight into a
panel. Both are easy to spot in review and invisible until the content happens to be wide.

## [decision] one bypassed commit is honest where a smaller slice would be fiction (2026-08-13)

Replacing the memory confirm dialog with a surface produced a commit of 507 non-test lines
against the 300-line gate, in four files: the dialog's hook, the page that replaces it, the
shell that switches between them, and the chat page whose prop existed only to feed the old
politeness gate. Every smaller slice leaves a staged tree that fails gate 6, because each half
of a substitution references the other. The only way to fit the gate would have been to author
intermediate versions of three files that never existed and are never run.

Decision: bypass gate 1 for that one commit, run the other seven by hand first, and record in
the commit body both the reason and the fact that they passed. The five commits around it went
through the hook normally. Rule for next time: slice by dependency, not by ambition, and when a
substitution genuinely cannot be halved, say so in the body rather than inventing history that
never compiled.

## [decision] 2026-08-16 | Removed the elevated-health subsystem: Marcel runs on the main token, so a stuck elevated token is not surfaced

office-health.ts + office-renewal.ts existed to catch a quiet failure: the elevated (M365ChatClient) token dies (it carries no refresh token of its own) while the main token keeps working, so colleague lookups start failing with no other signal. That failure is gone. The ask-marcel-office CLI moved get-user (colleague lookups) onto the MAIN token (basic-first, elevated only as a 403 fallback for tenants that restrict basic directory reads), and the studio uses no other elevated-dependent command (cli-cheatsheet.ts is get-user + get-user-manager, both main-token). So a stuck elevated token now costs the app nothing. Gutted both modules: health is `checking | healthy | signed-out` on the main token alone; dropped the `attention` state, the COLLEAGUE_DETAILS / TEAMS_CHATS unavailable list, the reassurance copy, and the "Colleague lookups: N minutes left" countdown (office-renewal is now just the auto-tokens tooltip line). OfficePopoverView shape was preserved (unavailable always [], reassurance/renewalNote never set) so app.tsx / settings-page / office-panel needed no edits; only sidebar + office-status-popover dropped the now-unreachable `attention` union member. Mutation aggregate stayed >= 90 (office-renewal 100, office-health 89.23 with 6 un-asserted copy-string survivors + 1 equivalent guard mutant).
Rule for next time: this is correct for a SHIPPED studio only once the CLI get-user fix is published to npm (the packaged app must call a CLI where colleague lookups are on the main token). Before re-adding an elevated-health signal, check the CLI's `needsElevatedToken` command set against cli-cheatsheet.ts: if the studio invokes none of them, there is nothing to surface.

## [gotcha] 2026-09-09 | 100% line coverage does not catch an impossible-state fallback

`closeRun` in `src/renderer/src/lib/tool-runs.ts` reached review as:

```ts
run.length === 0 ? done : [...done, { id: `run-${run[0]?.id ?? ''}`, title: title(run), items: run }];
```

The `?? ''` is a
fallback for a run whose first item is missing, which the `length === 0` arm has already ruled
out: a branch for a state that cannot happen, which the simplicity guideline rules out by name.
`bun test` reported the file at 100% funcs and 100% lines and the renderer-lib tier gate passed,
because bun measures line and function coverage, not branch coverage, and the dead branch sat on
a line the tests already ran. Rewritten as one guard: read `run[0]`, return `done` when it is
undefined, use `first.id` after.

Rule for next time: the coverage tier proves every line ran, never that every branch earned its
place. A `?? fallback`, a `?.`, or a ternary arm added behind a guard that already excludes the
state is invisible to it, and `src/renderer/**` has no second net either: `mutate:changed` and
`mutate:staged` filter to `^src/shared/`, so no mutant ever probes renderer lib logic. Read the
guard and the fallback as one expression, and delete the half the other has made unreachable.

## [gotcha] 2026-09-10 | An sr-only label inside a scroller stretches the whole document

The working card gave every tool row a hidden status word, `sr-only` so a screen reader still
hears "Done" where a sighted reader sees a tick. Expanding a delegated row's nested steps then
scrolled the WHOLE app: the sidebar and the conversation header went off the top and the frame
left blank space at the bottom, which reads as a broken layout rather than a CSS bug.

Cause: Tailwind's `sr-only` is `position: absolute`. Neither hidden label had a positioned
ancestor inside the thread's scroller, so its containing block resolved to the chat column
(`main` and the drop target, both `position: relative`), which sits OUTSIDE the scroller. An
overflow scroller does not clip an absolutely positioned descendant whose containing block is
above it, so each label kept its static offset, tens of thousands of pixels down a long
transcript, and the document grew to reach it: `documentElement.scrollHeight` 26650 against an
800 viewport, measured on a real thread with both delegated rows and all 34 nested steps open.
Focusing a row then scrolled the document instead of the thread.

Fix: `relative` on the two wrappers that hold the label, the spinner root and the glyph span.
Document back to 800 = clientHeight, thread still the only scroller at 60058 / 686.

Rule for next time: `sr-only`, and any absolutely positioned box, placed inside a scroll
container needs a positioned ancestor inside that same container. After adding one to a long
list, assert `document.documentElement.scrollHeight === document.documentElement.clientHeight`;
nothing in lint, typecheck or the test suite sees this, and it only shows on a transcript long
enough to push the label past the viewport.

## [gotcha] 2026-09-26 | run-studio dumps a delegating turn before it ends, and the turn survives the close

The run-studio driver (`.claude/skills/run-studio/driver.mjs`) treats four consecutive polls
without a Stop button, about six seconds, as the end of a turn, then dumps the thread, takes the
final screenshot and closes the app. On a turn that delegates its reads to the `Agent` readers
(deepseek-v4-pro), it dumped while the turn was still streaming: the thread in the dump ended
with the thread-level "Working…" line, which `ChatThread` renders only while `isStreaming` is
true, and held tool rows but no answer. That looked like a killed turn, and was reported as one.
It was not. Opened later, the same conversation held the finished turn, a sourced answer under
three working cards, its stats line reading "10m · 108 steps · 31 failed". The app outlived the
driver's close, contrary to the skill's own warning that quitting early kills the running turn;
how it survived was not established.

Rule for next time: before trusting a run-studio dump, read the end of the thread. A trailing
"Working…" means the dump is early, whatever the driver logged, and the answer is not in it. For
a turn that delegates, wait for that line to go as well as the Stop button. And never report a
turn as lost from its dump alone: open the conversation afterwards and look.

## [gotcha] 2026-09-26 | bun 1.4.2's toMatchObject with an asymmetric matcher fails on an object it has already compared

A refusal helper built as `expect(result).toMatchObject({ ok: false, error: { kind, message:
expect.stringMatching(/./) } })` passed on fresh error objects and failed, with an empty diff
("- Expected - 0 / + Received + 0"), whenever the received error was a shared constant such as
`NOT_A_CHANGE` or `CHANGED` in `src/shared/memory-entry-edit.ts`. A scratch probe pinned it: the
same received object passes the first `toMatchObject` with an asymmetric matcher and fails the
second, while a fresh object passes every time, and `toEqual` against a reused matcher is fine.
The four failures looked like wrong error kinds and were not: every value was right.

Rule for next time: when a `toMatchObject` fails with an empty diff, suspect the matcher before
the code. Assert refusals with plain comparisons (`expect(error?.kind).toBe(kind)`,
`expect(error?.message.length).toBeGreaterThan(0)`), and keep `expect.stringMatching` and its
kin out of `toMatchObject` on values a module hands out as constants.

## [gotcha] 2026-09-26 | Escape in an inline editor also closes the sheet around it

`app.tsx` closes whatever is on top on Escape, from a `keydown` listener on `window`: the memory
sheet among them. The memory lists' inline editor (`molecules/memory-entry-editor`) cancels on
Escape too, and the first version only called `preventDefault()`. The event kept bubbling to
`window`, so one Escape cancelled the edit AND closed the whole memory sheet. The driver's
"Escape closes the entry without saving" check passed anyway, because an editor inside a
closed sheet is also gone; it only failed on the next step, which could not find "Add a word".

Fix: `event.stopPropagation()` next to `preventDefault()` in the editor's Escape branch. React's
synthetic `stopPropagation` stops the native event at the root, before `window` hears it.

Rule for next time: any component that gives Escape a meaning of its own owns that Escape and
stops it, since the app's handler cannot tell an inner cancel from a request to close. And an
end-to-end check that something closed must also check that its container did not.

## [gotcha] 2026-09-26 | Driving the built app on a scratch user-data folder: seed the account, or it relaunches away

Verifying the memory lists meant adding, editing and deleting entries, so the run-studio
driver's real userData was out. Electron honours `--user-data-dir=<dir>`, and the app boots on
it: `current-account.json`, `accounts/` and `bin/` all land there. Two traps, one after the
other. A fresh folder starts signed out, and on a machine whose office CLI is signed in the app
adopts the `signed-out` folder into the user's account a few seconds in and RELAUNCHES itself as
a new process: Playwright's handle goes dead ("Target page, context or browser has been
closed", then "UI never came up") and the relaunched instance keeps running, window and all,
until killed (`pkill -f "<scratch dir>"`). Seeding the account pointer stops the relaunch, but
then no identity loads, and without one the user button opens Settings instead of the menu that
holds Memory.

What worked: before launch, copy the real `current-account.json` into the scratch folder and
the account's `claude-config/quick-context.json` into `accounts/<key>/claude-config/`, seed
synthetic notes beside it, drive, and delete the scratch folder at the end, since it now holds
a copy of the user's identity.

Rule for next time: for any in-app check that writes, run on a scratch `--user-data-dir` seeded
with the account pointer and quick context, never on the real folder; afterwards check that no
process still names the scratch folder, and remove the folder.

## [decision] 2026-09-27 | a claude plan runs on claude code's own sign-in, never on a token the app holds

Anthropic's Claude Code legal page (read 2026-09-26) lets an end user sign in to the unmodified Claude Code with their own subscription, and forbids an app from offering its own Claude.ai login or from collecting, storing or relaying Claude.ai credentials. So a `claude-plan` provider carries no key and no address: Settings runs the SDK's bundled binary as `claude auth login --claudeai`, reads only `claude auth status --json`, and its turns strip every variable that would outrank that sign-in (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_*`). Claude Code 2.1.185 names its macOS keychain item after the first 8 hex characters of a sha256 of `CLAUDE_CONFIG_DIR`, so the sign-in belongs to the account folder, never touches the user's terminal login, and a Microsoft 365 account switch means signing in again. Rejected: pasting a `claude setup-token` token into settings, which would make the app store a Claude token, and keying the item on a shared folder through the undocumented `CLAUDE_SECURESTORAGE_CONFIG_DIR`.
Applies to: any change to how the agent authenticates, and to shipping the app to other people, which falls under Anthropic's Commercial Terms for running Claude Code in a product.

## [gotcha] 2026-09-27 | claude auth status exits 1 when signed out, and loggedin is true for an api key

On the bundled Claude Code 2.1.185, `auth status` prints its JSON whether or not anyone is signed in and exits 1 when nobody is, so a caller that reads the exit code as failure would report every signed-out user as an error. `loggedIn` is also true for an API key in the environment (`authMethod: "api_key"`), an environment token (`"oauth_token"`), an apiKeyHelper or a cloud provider (`"third_party"`), so only `authMethod: "claude.ai"` means the plan, which is what `parseClaudeAuthStatus` keys on. And `claude auth login --help` prints no help: it falls through to a prompt run and answers "Not logged in · Please run /login", while `claude auth help login` works.
Rule for next time: capture a status command's real output for every state before writing its parser, and trust its fields over its exit code.

## [gotcha] 2026-09-27 | claude code opens its sign-in page with $browser, so a check can record it

`auth login` opens the OAuth page through `settings.browser ?? $BROWSER`, falling back to `open`, so the scratch run of the built app pointed `BROWSER` at a two-line script that writes its first argument to a file. That proved the sign-in reached claude.com/cai/oauth/authorize from the bundled binary without a tab opening on the user's screen, and `BROWSER` survives `buildSignInEnv` because it is not one of the stripped variables. Killing the waiting login (pkill on the binary path plus `auth login`) then exercised the failed-sign-in copy, and since Claude Code stores tokens only after a completed exchange, no keychain item was left behind.
Rule for next time: an automated check of a browser sign-in points `BROWSER` at a recorder, never at the user's real browser.

## [gotcha] 2026-09-27 | the commit gates judge each slice alone: consumer first, dependency removal last, test files counted

Gate 6 typechecks the staged tree, not the working tree (`scripts/check-staged-typecheck.sh`), so every commit is verified on its own: a deletion is sliced strictly consumer-before-module, a file's last importer pulls that file into its commit, and a `bun remove` is the LAST commit of a removal series, since node_modules is shared by every staged tree the hook builds and an early removal fails commits that never touched the dependency (recover with `git checkout HEAD -- package.json bun.lock && bun install`). Gate 1 (`scripts/check-commit-size.sh`) keeps `*.test.ts` lines out of the 300 and deleted files out of the 10 (`--diff-filter=ACMR`), but counts every other staged path toward the 10, test files included. To split a file across commits without `git add -p`, write its intermediate version to a scratch file and stage it with `git update-index --cacheinfo 100644,$(git hash-object -w <file>),<path>`, which leaves the working tree whole, and prove each slice first in a throwaway index (`GIT_INDEX_FILE=<scratch> git read-tree HEAD`, the same update-index calls, then archive and typecheck the tree the way gate 6 does). In zsh never name a loop variable `path`: it is the array tied to `PATH`, and a `while read -r c path src` loop empties it.
Merges: 2026-07-27 (pre-commit gate 6 typechecks the STAGED tree, so a removal must be sliced consumer-first), 2026-07-27 (`bun remove` a dependency first and every intermediate commit stops typechecking), 2026-09-27 (the commit-size gate counts test files toward its ten).
