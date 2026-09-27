# Current run: a Claude plan provider lists its own models (approved 2026-09-27)

Typing model names for a Claude plan is guesswork. The Agent SDK's `supportedModels()` asks
the bundled Claude Code for its list through Claude Code's own sign-in, in under a second and
without sending a turn (probed 2026-09-27: `default`, `opus[1m]`, `sonnet`, `sonnet[1m]`,
`haiku`). Probed against a capture server, the list's values are aliases Claude Code resolves
itself (`sonnet` -> `claude-sonnet-4-6`, `opus[1m]` -> `claude-opus-4-8`, via `ANTHROPIC_MODEL`
and `--model` alike) only while no `ANTHROPIC_DEFAULT_*_MODEL` pins them: pinned to the alias
it sends the literal `"sonnet"`, and an inherited `ANTHROPIC_DEFAULT_HAIKU_MODEL` turns `haiku`
into Sonnet. `default` is sent literally in every case, so it is left out of the list.

Built on this branch while PR #1 is open; where it is pushed is decided at the end.

1. [x] Shared: `parsePlanModels` (SDK list to `PlanModel`s, `default` left out, an unusable
       list refused) and `isClaudeCodeAlias`; session-env leaves an alias plan turn's
       `ANTHROPIC_DEFAULT_*_MODEL` to Claude Code, inherited ones removed. Done: tests green,
       100% tier, mutation >= 90 on the staged files. DONE: claude-plan 98.18, session-env
       97.78 (the alias test's fixture now inherits all three pins, which killed two mutants).
2. [x] Main: `claude-plan-models.ts` (+test) behind a `ClaudeModelList` seam; the IO shell runs
       a query whose prompt never yields, reads `supportedModels()`, 15 s deadline,
       `settingSources: []`, `persistSession: false`, then aborts. Channel `claude-plan:models`
       in the contract (test updated, confirmed), register, preload, index. Done: tests green,
       typecheck clean. DONE: the real IO shell answered in 2.7 s cold with `opus[1m]`, `sonnet`,
       `sonnet[1m]`, `haiku`, no stray rejection after the abort, no process left.
3. [x] Renderer: `mergeModelsInto` and `shouldLoadPlanModels` (lib, tested), the models button
       state in `planSignInView`, `loadModels` in the hook, a "Load models from Claude Code"
       button in the plan block, and a one-time automatic load when a signed-in plan
       provider with no models is open. Done: lint 0/0, typecheck, lib tier 100%. DONE: the
       button state is its own `planModelsView`, so the committed sign-in view tests stand.
4. [x] README line for the list; built app on a scratch folder: the button fills the models
       (signed out, the list still comes back), save keeps them. Done: checks listed. DONE: 7/7
       on a scratch folder; the automatic fill after a real sign-in is unit-tested, not seen.
5. [ ] Commits on a yes, then push or PR per the user's call on #1.

---

# Current run: run the agent on a Claude plan (approved 2026-09-26)

The user wants their Claude subscription (Pro, Max, Team, Enterprise) to pay for the agent
instead of an API key. Anthropic's Claude Code legal page (read 2026-09-26) allows an end
user to sign in to the unmodified Claude Code with their own subscription, provided sign-in
completes through Anthropic's own flow and the app never collects, stores or relays the
token. The Claude Code bundled with SDK 0.3.185 (2.1.185) has `auth login --claudeai` and
`auth status --json`, and its macOS keychain item is named after a sha256 of
CLAUDE_CONFIG_DIR, so a sign-in made with the account's claude-config is exactly the one the
agent's turns find, and never the user's own terminal login.

v1 assumptions, confirmed by the user: no Test button on a plan model (a real check spends
plan usage and needs a second launch path); no sign-out (signing in again replaces the
account); the sign-in lives with the account folder, like the notes.

1. [x] Shared `claude-plan.ts`: `parseClaudeAuthStatus` (Claude Code's `auth status` JSON to
       signed in or out, a plan sign-in only when `authMethod` is `claude.ai`) and
       `claudeCodeBinarySpecifier` (the platform package's `claude`, as the SDK resolves it).
       Done: tests green, 100% tier, mutation >= 90 on the staged file. DONE: 8 tests, 100%,
       mutation 90.63 before two survivors were closed (a strict assertion, a dead guard).
2. [x] Sign-in plumbing: session-env `buildSignInEnv`; ipc-contract `ClaudePlanError`,
       `claude-plan:status`, `claude-plan:login`, `StudioApi.claudePlan`; main
       `claude-plan-service.ts` (single-flight login, 15 s status and 10 min login deadlines)
       and `claude-plan-io.ts` (spawns the binary, no shell); register.ts, preload, index.ts.
       Done: service tests green, ipc-contract test updated (confirmed), typecheck clean.
       DONE: 7 service tests + 2 env tests, 100%; smoke run against the real binary with a
       scratch config folder read `signedIn: false` with an inherited API key stripped.
3. [x] Provider kind `claude-plan` in main and the shared types: settings-doc (no key; any
       key or address sent with it is dropped), settings-store (nothing to seal), session-env
       plan branch (strips ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN,
       ANTHROPIC_BASE_URL and the three CLAUDE_CODE_USE_* switches; bare model id),
       provider-draft, and the kind unions the renderer types carry. Not offered in the UI yet.
       Done: tests green, 100% tiers, mutation >= 90 on the changed shared files. DONE: the
       plan member types `apiKey?: never` and `baseUrl?: never`, so existing tests reading a
       provider's key compile unchanged. Mutation: claude-plan 96.61, session-env 97.50,
       settings-doc 90.83. One survivor on new code: stripping the overrides for every kind
       breaks no test (proposed as a follow-up, not done).
4. [x] Settings UI: "Claude plan" in Kind; the form shows a sign-in block instead of the key
       and address; no Test on plan models; the row flags "Not signed in" instead of "No
       key"; `lib/claude-plan-view.ts` (+test) and `hooks/use-claude-plan.ts`.
       Done: lint 0/0, typecheck clean, renderer lib tier 100%. DONE: 10 view tests; the row's
       `hasKey` became a typed `flag` computed in lib; full suite 1864 pass, coverage green.
5. [x] README: the Claude plan provider, what the app does and never does with the sign-in,
       where usage is billed. Done: README matches the surface. DONE: new section plus the
       settings line; the empty-state card now names the plan too.
6. [x] Verified in the built app on a scratch user-data folder: the kind, the sign-in block,
       "Not signed in" on the row, a save and reload keeping the provider keyless, the Sign
       in button launching Claude Code's login; a signed-in turn answered on the plan, with
       the user completing the browser step. Scratch keychain item removed with `auth logout`.
       DONE: 19/19 on a scratch --user-data-dir with BROWSER pointed at a recorder, so nothing
       opened on screen; the login reached claude.com/cai/oauth/authorize from the bundled
       binary and was then killed, so no keychain item was made. The review (atelier-review-me)
       found three things, all fixed with approval: a signed-out plan turn now says where to
       sign in instead of Claude Code's "/login", a neutral handle in the new test, required
       sign-in props. STILL OPEN: a signed-in turn, which needs the user's own browser sign-in.
7. [x] Commits proposed module-before-consumer, each <= 10 files / 300 lines, each on a yes.
       DONE: six commits (5405d13..this one), each through the 8-gate hook; the gate counts
       test files toward its 10, so the series is six rather than five. session-env,
       provider-form, provider-row and settings-page were staged in parts, each slice
       typechecked in a scratch index before anything was committed.

---

# Current run: a clear that sticks, then keyboard triage (approved 2026-09-27, "continue")

E: after Clear all memories the writing voice and signature came back on the next launch, because
the launch jobs refill any document that is empty. They now leave alone a document that exists,
even empty: emptying it, by hand or with Clear all, is a choice. Only a document never written is
filled in. Copy follows (the confirm, the two empty hints). F: the review list works from the
keyboard: on a selected card, Up and Down move, Enter remembers, Backspace skips, and the next
card takes the focus once one is answered.

E1. [x] `fileExists` in json-file.ts; the voice and signature jobs skip a document that exists;
        copy. Done: new test file, gates. DONE: the app log confirms both launch jobs skip an
        emptied file ("there is already a signature", "... a writing voice").
F1. [x] Lib `cardToFocus` (where the focus goes after a move or an answer). Done: new test file,
        100% tier.
F2. [x] Review row keys and focus ring, panel hint, page focus handling. Verified in the app.
G1. [x] Review; commits on a yes. DONE: 11/11 in-app checks; two commits, pushed.

---

# Current run: review list extras, then phase 3 (approved 2026-09-26, "1 then 2 and then 3")

Step A finishes the review list: a Remember all that takes every card as it stands, after an
inline confirm, and a "Heard in" link on each card that closes Memory and opens the
conversation the suggestion came from (hidden when that conversation is gone). Step B is phase
3: the menu regrouped (Waiting for you: To review; What Marcel knows: Words we use, People I
work with; About you: Who you are, Writing voice, Email signature), which also ends the
"What Marcel noticed" label wrapping beside its count; and Who you are and Writing voice
saved automatically (about a second after typing stops, and on leaving), with nothing typed
during a save lost. The signature keeps its explicit save. Step C appends the scratch-folder
cleanup lesson.

A1. [x] Lib: `answerOf` / `answersFor` (a row as it stands: wording, word, list; nothing for a
        row with no meaning or no word). Done: new test file, 100% tier.
A2. [x] Hook `rememberAll` (one answer at a time, stops at the first refusal); review panel
        Remember all + inline confirm; row "Heard in" link; page + app wiring.
A3. [x] Verified in the built app on a scratch folder; review; commits on a yes.
        DONE: 6/6 in-app checks; one commit, pushed.
B1. [x] Lib `autosave.ts`: the draft to keep after a save lands (the saved text, unless more
        was typed meanwhile). Done: new test file, 100% tier.
B2. [x] Hook autosave (debounce, flush on leaving, remount only on reload or rebuild);
        DocumentEditor auto variant (status instead of Save and Cancel); nav regroup and
        titles. Done: lint 0/0, typecheck.
B3. [x] Verified in the built app: typed text lands on disk without a click, including when
        the sheet closes right after typing; review; commits on a yes.
        DONE: 10/10 checks. Crepe reports a change 200 ms late and cancels the report when
        destroyed, so the editor now hands its final text over as it closes; the review then
        caught that a replaced editor (a rebuild, the first read) would save its older text
        over the newer one, fixed with a revision check in lib/autosave (3 tests).
D1. [x] Clear all memories (asked mid-run, scope "Everything on Memory"): the three notes, the
        queue with its skipped words, and the three documents emptied in one call; the reading
        progress kept. A confirm that names everything and says the voice and signature come
        back from the mailbox on the next launch. DONE: 3 tests, 8/8 in-app checks.
C1. [x] Lesson appended; committed on a yes. DONE: three gotchas (scratch folder delete race,
        Crepe dropping the last keystrokes, a replaced editor's close-time save).

---

# Current run: memory review cards, phase 2 (approved 2026-09-26)

Every one of the 17 real suggestions across both accounts has zero alternative wordings, so each
review card was a one-option radio group plus "In my own words". A suggestion cannot be filed
under another list, and Skip is forgotten: `resolve('reject')` only drops the item, so the same
word is asked about again the next time a conversation uses it. This pass makes the meaning the
text itself (prefilled, click to reword; other wordings as chips only when Marcel offers some),
adds a File under menu, and makes Skip stick with an Undo. It also closes the rule 31 gap the
phase 1 review deferred: Edit as text no longer saves over a note that changed since it opened.
Out of scope: Remember all, a link to the source conversation, keyboard triage, menu regroup.

1. [x] Shared queue doc: `skipped` (normalised words, never the sentence) in queue.json,
       `skipCandidate`, `unskipCandidate`, `parseMemoryCandidate` exported; `addCandidates`
       holds skipped words back. Done: new test file green, 100% tier, mutation >= 90.
       DONE: 8 tests, mutation 96.48 (5 survivors, all on lines older than this change).
2. [x] Main: accept takes a `kind` (refile), reject keeps the word, `restore` undoes a skip
       (candidate re-validated); `write` takes the text it `expected` and refuses a changed note
       (StoreError `conflict`). Contract + register. Done: new service tests green.
       DONE: 9 tests; the review added one: an unknown answer is refused, never taken as a skip.
3. [x] Renderer lib: the list a row is filed under lives in its draft (`withKind`, `kindFor`);
       rewording keeps the word and the list. Done: new test file, 100% tier, old tests untouched.
4. [x] Design system: review row (meaning textarea, wording chips, File under select), review
       panel (a notice with Undo). Done: lint 0/0.
5. [x] Wiring: use-memory (remember with kind, last skip, restore), memory-page, the notes hook
       and list section (save with the opened text; a conflict keeps the text on screen).
6. [x] Verified in the built app on a scratch folder with a synthetic queue.
       DONE: 16/16 checks, from a chip filling the meaning to a text save refused over a note
       changed underneath; the scratch folder is deleted on exit.
7. [x] Review, then commits proposed module-before-consumer, each on a yes.
       DONE: 4 commits (3b2704a..this one), each through the 8-gate hook, pushed.
       Left for later: Remember all, a link to the source conversation, keyboard triage, a way
       to clear old skips, and the nav label that wraps beside its count.

---

# Current run: memory notes as lists, phase 1 (approved 2026-09-26)

The three notes (jargon, team, people) are markdown documents edited in a rich editor, so
removing one word means selecting text and saving the whole file. Every line of a real note
is already `- **term**: detail`, so a list loses nothing. Phase 1 turns "Words we use" into
a list, and merges My team + People I work with into one "People I work with" list with a
My team / Other chip per person (still two files underneath, so the prompt blocks do not
change). Per entry: edit in place, delete with an Undo bar, add, filter, a duplicate hint,
and a quiet "Edit as text" link per file. Phases 2 (review cards) and 3 (menu regroup,
document autosave) are out of scope.

1. [x] Shared core `src/shared/memory-entry-edit.ts`: `wantedEntry` (new-entry checks),
       `parseMemoryEntryEdit` (IPC trust boundary), `entryLineAt`, `applyMemoryEntryEdit`
       (add, update, remove, restore, move; addressed by the exact entry read, so a stale
       view is refused as not-found rather than overwriting). Done: tests green, 100% tier,
       mutation >= 90 on the staged file. DONE: 28 tests, 100%, mutation 97.88 (5 survivors:
       2 equivalent, 3 message strings).
2. [x] Main: `memory-service.ts` `edit(input)` returns all three notes; note writers
       (edit, write, resolve) run one at a time. Channel `memory:edit` in the contract,
       register.ts, preload. Done: new service tests green, ipc-contract test updated
       (confirmed), typecheck clean. DONE: both concurrency tests fail 3/3 without the queue.
3. [x] Renderer lib `src/renderer/src/lib/memory-list.ts`: rows from note texts (A to Z,
       people merged with a team flag), filter (case/accent-blind, term + meaning), team
       filter, duplicates, clash check for a draft, initials, token estimate, unread-line
       count. Done: 100% renderer-lib tier. DONE: 14 tests; row keys are content + occurrence so
       an open editor survives a neighbour's removal.
4. [x] Design system: molecules `action-notice`, `memory-entry-row`, `memory-entry-editor`;
       organism `memory-list-panel`. Done: lint 0/0 (rules 21-22, a11y), no hooks.
5. [x] Wiring: `hooks/use-memory-notes.ts`, `page/memory-list-section.tsx`, `memory-page.tsx`
       nav (team + people become one item) and sections. Done: typecheck + lint clean.
6. [x] Verified in the built app: add, edit, delete + undo, filter, move between team and
       other, duplicate banner, edit as text, and document scrollHeight == clientHeight.
       DONE: 28/28 checks on a scratch userData (never the real one); caught Escape in the
       editor also closing the whole sheet, fixed with stopPropagation.
7. [x] Commits proposed module-before-consumer, each <= 10 files / 300 lines, each on a yes.
       DONE: 7 commits, each through the 8-gate hook (5f04bd7..this one). The review split the
       section into memory-list-section + memory-list-view to fit the size gate, and fixed the
       chip's accessible name, a refused save losing fresh typing, the filtered-empty copy, and
       the empty-state flash before the first read. Deferred: a versioned `memory:write` for
       Edit as text (rule 31; unreachable from one window today).

---

# Current run: remove the elevated-health subsystem (approved 2026-08-16)

The ask-marcel-office CLI moved get-user (colleague lookups) onto the main token, and the
studio uses no other elevated command (cli-cheatsheet.ts). So a stuck elevated token now costs
the app nothing: the amber "quick refresh" prompt and the "Colleague lookups: N min left"
countdown are false. office-health/office-renewal existed only to surface that now-impossible
failure. End state: health is checking | healthy | signed-out on the main token alone.

1. [x] office-health.ts: drop `attention` from OfficeHealth; healthFromStatus returns
       healthy/signed-out/checking on the main token; remove tiersOf/isStuck/lostFunctions/
       COLLEAGUE_DETAILS/TEAMS_CHATS; popover unavailable=[] always, canRefresh=signed-out,
       canSignOut=healthy. OfficePopoverView field shape kept (reassurance?/renewalNote? stay,
       always absent) so app.tsx/settings/popover/panel need no edits.
2. [x] office-renewal.ts: delete renewalNote + the elevated breakdown line; tokenBreakdown
       returns just the auto-tokens tooltip line.
3. [x] sidebar + office-status-popover: drop `attention` from their health unions + the
       sidebar healthDot entry.
4. [x] office-health.test.ts (9 removed/rewritten, +1 pinning stuck-elevated -> healthy) and
       office-renewal.test.ts (down to the 4 tokenBreakdown tests). user-approved, rule 24.
5. [x] Gates green: bun test 1770 pass, typecheck node+web clean, lint 0/0, coverage all tiers
       (lib 100%), mutation aggregate 90.41 >= 90 (office-renewal 100, office-health 89.23 with
       6 un-asserted copy-string survivors + 1 equivalent guard mutant). Commit gated on user.

---

# Current run: remove the embedding-backed memory (approved 2026-07-27)

The searchable memory needed an OpenAI-compatible embedding provider for every add and
every search, and the user does not want that dependency for now. The notes memory
(jargon/team/people markdown, the elicitation queue, the confirm dialog, the glossary
block on every turn) needs no embeddings and stays whole.

Removing it also settles two bugs found while answering the question: the composition
root always built the sqlite store, so its embed failure surfaced as `unavailable`, never
the `not-configured` kind the service branched on. Accepting a candidate therefore errored
instead of falling back to the note, and `migrateNotes` wrote its done-marker after every
add had failed. Both branches disappear with the feature: accepting now writes the note,
full stop.

## STATUS: DONE (2026-07-27), not committed

1. [x] Deleted 19 files: `main/services/memory/{sqlite-memory-store,embedder-io}.ts`,
       `main/services/agent/memory-mcp.ts`, `shared/{embedding,vector-math,memory-store,
       memory-tools-core,memory-migrate}.ts` + their 5 tests,
       `test-helpers/fake-memory-store.ts`, renderer
       `organisms/{memory-page,memory-config-panel}`, `molecules/memory-entry-row`,
       `hooks/use-memory-{store,config}.ts`.
2. [x] Main unwired: `index.ts` (store composition, `MEMORY_PREAMBLE`, the
       `migrateNotes` launch call), `ipc/register.ts` (6 handlers + the `memoryStore` dep),
       `agent-runtime.ts` (the whole `mcpServers` option, `memoryStore`, `memoryPreamble`),
       `memory-service.ts` (store dep, `migrateNotes`, the dead not-configured branch).
3. [x] Contract unwired: `ipc-contract.ts` (6 channels + 6 api methods), `paths.ts`
       (`memoryDbPath`, `memoryMigratedMarkerPath`), `types.ts` (`MemorySettings` + both
       `memory?` fields), `settings-doc.ts` (`memoryField` and its two call sites),
       `preload/index.ts` (6 methods). `context-blocks.ts` lost `memoryPreamble`, which
       existed only to announce the removed tools.
4. [x] Renderer unwired: `app.tsx` (the `'chat' | 'memory'` view state and all three
       `setView` sites, the MemoryPage render, the forget-everything ConfirmDialog); the
       user menu's Memory item now opens Settings at the notes section instead of a
       surface of its own. `settings-page.tsx` lost the config panel and its hook.
5. [x] Tests trimmed (user confirmed both rounds, rule 24): memory-service (3
       `migrateNotes` cases dropped, 2 store cases rewritten against the note),
       settings-doc (13 cases replaced by one asserting the stale section is dropped, not
       refused), paths (2), ipc-contract (6 names), context-blocks (4 cases lose the field).
6. [x] `bun remove better-sqlite3 @types/better-sqlite3`, `rebuild:native` script and
       `trustedDependencies` gone, electron-builder + README comments corrected.
7. [x] Gates: `bun test` 1774 pass / 0 fail (97 files); `bun run lint` 0 errors 0 warnings
       (2 prettier reflows fixed with `eslint --fix`, mechanical); `bun run typecheck`
       clean; `bun run coverage` all tiers green; `bun run build` succeeds.

8. [x] Verified in the built app (`run-studio`): a full multi-step turn ran with no
       `mcpServers` option at all, and the thread carried zero memory_* tool calls. The
       glossary path went untested, because the driver opened the `1gygrzy` account, which
       has no notes; the notes live in `mdx86f`. Settings > Memory and the user-menu item
       are still unverified: the driver only drives the chat surface.
9. [x] Landed as 10 commits (`0cc1007..eb9a476`), each passing all 8 pre-commit gates.

Left behind on purpose: an existing `memory.db` under userData is orphaned, not deleted,
and a `memory` section in an existing settings.json is ignored on read and dropped on the
next save. `@electron/rebuild` is still a devDependency with no consumer now that
`rebuild:native` is gone.

Slice order that works, consumer before module: renderer surfaces -> renderer hooks ->
main unwiring (carries `context-blocks.ts`) -> sqlite store and embedder -> agent tools
and the store fake -> the ipc contract (carries `memory-store.ts`) -> vector math,
embedding parser, note migration -> the dependency last. See LESSONS for why.

---

# Previous run: token-refresh triage fix + renewal countdown (approved 2026-07-26)

Design review of the Microsoft 365 sign-in popover surfaced that `office-health.ts`
treated any unavailable token tier as attention-worthy, even chatsvcagg/ic3, which the
CLI's own docs say self-heal from the shared refresh token and are "informational rather
than a preflight gate." Only the elevated tier is actually stuck (no refresh token,
~hourly, interactive-only). Fixed the triage to key off `tier.refresh === 'interactive'`
instead of `tier.available` alone, softened "has expired" copy to "needs a quick
refresh" throughout, and added a small renewal countdown for the elevated tier.

## STATUS: DONE (2026-07-26)

1. [x] `office-health.test.ts`: added `refresh: 'interactive'` to elevated-tier fixtures
       that were implicitly relying on the old any-tier-unavailable logic; rewrote the two
       Teams-substrate tests to assert `healthy`/`[]` instead of `attention`; updated the
       `dotLabel('attention')` string; added the chatsvcagg+ic3-stays-healthy test and two
       renewalNote wiring tests. User confirmed the full diff before it was written (rule 24).
       VERIFIED: RED before prod changes, GREEN after.
2. [x] `office-renewal.ts` (new): `renewalNote(status)`, pure, split out of office-health.ts
       to keep it under the ~100-line budget and because it's a distinct concern (countdown
       display vs. break/fix triage). `office-renewal.test.ts` (new): 8 tests, 100% coverage.
3. [x] `office-health.ts`: `isStuck(tier) = !available && refresh === 'interactive'`,
       replaces the `!tier.available` checks in `healthFromStatus` and `lostFunctions`.
       Copy: `HEADLINES.attention`, the `healthFromStatus` fallback message, and
       `DOT_LABELS.attention` all dropped "has expired" for "needs a quick refresh";
       `reassurance` gained "this happens periodically and is expected."
4. [x] `office-status-popover/index.tsx`: `renewalNote?: string` prop, rendered as a muted
       line alongside `reassurance`. `app.tsx`: wired `office.popover.renewalNote` through.
5. [x] Gates: `bun test` 1825 pass / 0 fail; `bun run lint` 0 errors 0 warnings (two
       prettier-format warnings from the test/lib edits fixed via `eslint --fix`, mechanical
       only); `bun run typecheck` clean; `bun run coverage` all tiers green, both new files
       100%/100%.

Not committed. Not run in the built app (pure-logic + copy change, verified by the
lib-tier test suite).

## Follow-up round (same day): user feedback from the live app

Live screenshot showed the countdown, then two more fixes: popover positioning and
text density.

6. [x] `office-status-popover/index.tsx`: `placement="up-start"` -> `"up-end"`. The dot
       sits at the far right of its positioning ancestor (a full-width sidebar footer
       div); left-anchoring put the popover far from the button. Matches the `down-end`
       convention already used for the row-menu popover in `sidebar/index.tsx`.
7. [x] Same file: wrapped headline/unavailable/reassurance/renewalNote in a
       `role="status"` div so screen readers get notified when health changes while the
       popover is open (`error` already had `role="alert"`, this closes the gap for
       everything else). No test gate, untested design-system tier.
8. [x] `office-renewal.ts`: copy cut from "Colleague lookups are good for about N more
       minutes, then need a quick refresh." to "Colleague lookups: about N minutes
       left." per "too much text" feedback. Updated the 3 affected assertions in
       `office-renewal.test.ts` to match (not re-confirmed with the user individually,
       the shortened wording was implicit in what they'd already flagged).
9. [x] `app.tsx`: `onToggleOfficeStatus` now calls `office.reload()` when opening (not
       closing), so the countdown is fresh at view time instead of showing whatever the
       last 5-minute poll or window-focus event happened to catch.
10. [x] Gates re-run: `bun test` 1825/1825, `bun run lint` 0/0, `bun run typecheck` clean,
        `bun run coverage` all tiers green.
11. [x] Signed-out headline: dropped `text-danger`, always `text-ink`. Copy: "has ended.
        To let Marcel read your mail, files and calendar, sign in again." (avoided
        capitalized "Sign in again" breaking the existing `toContain('sign in again')`
        test). Sign-in button tried `danger` variant, then user clarified "the button"
        meant the sidebar dot, not this button; reverted the button to its original
        `secondary`/`primary` ternary.
12. [x] `sidebar/index.tsx`: `healthDot['signed-out']` was `bg-ink-muted` (gray, same
        visual weight as "nothing to see"), now `bg-danger`. This was the actual ask,
        the worst state was previously the least alarming-looking dot.
13. [x] Gates re-run again: all green.
14. [x] `canRefresh` added to `OfficePopoverView` (`attention || signed-out`), button
        hidden entirely when healthy/checking. 4 new tests, gates green (1829 pass).
15. [x] renewalNote copy: "Colleague lookups: about N minutes left, then refresh to
        keep using them. Everything else renews itself." Answers "where's the main
        token's timer" in-app: there isn't one because the access token auto-refreshes
        forever off the shared refresh token, a countdown would be noise since nothing
        is ever needed from the user. No test changes, new copy is a superset of the
        old assertions. Gates green.
16. [x] New feature (not a bug): `tokenBreakdown()` in office-renewal.ts, a per-token
        multi-line breakdown for the dot's native `title` hover tooltip (separate from
        `aria-label`, which stays the short health label). Wired: OfficePopoverView.dotDetail
        -> Sidebar officeDetail prop -> dot's title={officeDetail ?? officeLabel}. 9 new
        tests in office-renewal.test.ts, 2 wiring tests in office-health.test.ts. 1840 pass,
        gates green.
17. [x] User caught a self-contradiction: the tooltip's main-token line showed the
        access-token countdown, the exact "meaningless number" already argued against
        earlier for the same token. Replaced with a qualitative line on what actually
        ends the auto-refresh cycle (sign out / password change / revoked access);
        dropped the per-token split since mail/calendar/files and Teams chats share the
        same refresh token and the same failure mode. 3 tests replaced with 2. 1839
        pass, gates green.
18. [x] "Same way of doing here" applied to the Settings > Microsoft 365 panel
        (`office-panel/index.tsx` + `settings-page.tsx`), which turned out to be a
        separate, drifted implementation (own OfficeView type, never used
        canRefresh/renewalNote from office-health.ts, and still said "Part of your
        sign-in has expired" while the popover had already moved to "needs a quick
        refresh"). Fixed: refresh button hidden when `unavailable.length === 0` (mirrors
        canRefresh, derived from the already-present field, no new one needed);
        renewalNote pulled through from the same `popoverViewFromStatus(status.value)`
        call this file already made for `unavailable`, rendered under the status line;
        "has expired" copy aligned with the popover's tone. Both files are untested tier
        (page-shell + design-system organism), no test changes. Gates green, 1839 pass.
