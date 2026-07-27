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
