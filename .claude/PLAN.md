# Current run: fold the title band into the columns (approved 2026-07-24)

Full plan: `~/.claude/plans/modular-weaving-flurry.md`. Claude Desktop-style chrome: remove
the empty full-width 36px drag band, run the sidebar surface to the window top with the
traffic lights over it, move the conversation title into the content column's top strip.
Two commits, each green through the gates.

## STATUS: DONE, COMMITTED (2026-07-24)

Landed in two slices: `eedbb2a` (fold the band) and `0762562` (tighter rows, draggable
empty states). All 8 pre-commit gates green on each. Verified in the BUILT app via a
Playwright geometry+screenshot probe and a main-process probe (scratchpad, deleted).
Not pushed (parity with the previous run's "push only on Vincent's say-so"). Evidence below.

### Commit 1 — `feat(ui): fold the title band into the columns`

1. [x] `src/main/index.ts`: added `trafficLightPosition: { x: 18, y: 18 }`; kept `hiddenInset`.
       VERIFIED: `getWindowButtonPosition()` returns `{x:18,y:18}` (Electron honored it under
       hiddenInset, hedge not needed); `bounds === contentBounds` (lights overlay content,
       no native title bar); y-center 24 = midline of the 48px strip.
2. [x] `app-frame`: band deleted; root flex row; `<main>` relative, keeps `min-h-0 min-w-0`;
       `bandControl` → `reopenControl` as main's first child.
       VERIFIED: aside top:0 left:0 (was 36), main top:0 relative, no band.
3. [x] `sidebar`: `h-12 justify-end px-2` drag strip holds the collapse button (no-drag
       wrapper); New conversation full-width; resize handle now no-drag; `menuItem` py-1.
       VERIFIED: strip top:0 h:48 region=drag.
4. [x] `conversation-header`: `sticky top-0 h-12 bg-surface/80 backdrop-blur` drag, border-b
       dropped; `insetForWindowControls?` (pl-[8.5rem] pr-6 | px-6); no-drag on input + menu.
       VERIFIED: header top:0 h:48 region=drag borderBottom:0 backdrop:blur(8px);
       paddingLeft 24px open / 136px collapsed.
5. [x] `update-banner`: `insetForWindowControls?` → pl-[8.5rem].
6. [x] `app.tsx`: `reopenControl`; `insetForWindowControls={isCollapsed}` into header + banner.
       VERIFIED collapsed: chip top:0 left:88 w:28 region=no-drag; header inset 136.
7. [x] Stale comment sweep: settings-overlay, popover, panel-icon.
8. [x] This PLAN.md rewrite.

### Commit 2 — `feat(ui): tighter rows and draggable empty states`

9.  [x] `conversation-item`: rowBase py-1.
        VERIFIED: sidebar rows 32px (was 36).
10. [x] `empty-conversations` + `no-provider-notice`: full-size drag section, card no-drag.
        Verified by construction (lint/typecheck green); not re-screenshotted (trivial wrap).

### Accepted edge cases (do not chase as bugs)

Collapsed+memory / collapsed+boot-loading: no drag surface until the sidebar reopens (parity
with the settings overlay). Collapsed + >~1560px content: header inner box 56px right of the
thread column (cosmetic). Fullscreen keeps light-clearance padding (no fullscreen branching
exists). Scrollbar thumb near the top 48px falls in the header drag rect (tiny target).

### Runtime hedges

`hiddenInset` ignores `trafficLightPosition` → switch to `hidden`. Sticky-header drag stale
after scrolling (low risk) → move drag to an `absolute inset-x-0 top-0 h-12` sibling outside
the scroller inside the relative `<main>`, drop drag from the header.

### Out of scope, follow-up ticket

`backdrop-blur` makes the header a containing block, so the header menu popover's `fixed
inset-0` dismiss backdrop is confined to the header box and Escape does not close
`headerMenuOpen`. Pre-existing, not worsened here.

---

# Handoff from the previous run (22-requirement plan, all four phases COMPLETE 2026-07-24)

Full history in git and `.claude/LESSONS.md`. What is still live:

## THE ONE THING NOT DONE YET: publish a GitHub release

Vincent chose "push only" on 2026-07-24, so the commits are on origin/main but no release
exists. The update feature (R21c) is inert until one does: the checker calls
`repos/vdelacou/ask-marcel-studio/releases/latest`, which 404s on a repo with no releases,
and degrades silently by design. To make it live:

```bash
bun run dist   # only if release/ was cleaned; the DMG is gitignored
gh release create v0.1.0 "release/Ask Marcel Studio-0.1.0.dmg" --title "v0.1.0" --notes "..."
```

Version subtlety, so a future session does not chase a non-bug: the banner appears only when
the published release is STRICTLY higher than the running version. Releasing v0.1.0 while
0.1.0 is installed correctly shows nothing. The banner first appears on the next real version
bump. See the [decision] entry in LESSONS.md.

## Deferred by decision (need Vincent's sign-off, not blockers)

- Delete memory-glossary.ts + tests (rule 24 needs his ok; plan holds it one release anyway,
  so "do nothing yet" remains a valid answer).
- scripts/eval-memory.ts, the optional manual eval harness (rule 32 gate, needs a real key).
  Only worth building if the memory preamble or embedder gets tuned again.

## Disk left behind, safe to delete when he says so

- `release/` : the DMG plus the unpacked bundle, roughly 900 MB, gitignored.
- `~/Library/Application Support/ask-marcel-studio-backup-pre-accounts` : 492 MB, the pre-R23
  data snapshot taken before the per-account migration. The migration was verified against
  the real data folder, so this is a belt-and-braces copy.

## Operational facts a fresh session needs

- Packaging needs three things first or it fails: `bun run fetch:python`, `bun run
  fetch:wheels`, `bun run rebuild:native`. Then `bun run dist`. Both vendor dirs are present
  on this machine.
- `better-sqlite3` is currently built for the Electron ABI (rebuild:native was run). `bun
  test` is unaffected: nothing it loads imports the native module.
- `release/` is in eslint's ignores. It has to stay there or `lint:strict` hangs walking the
  packaged node_modules, which surfaces as an unexplained pre-commit timeout (see LESSONS).
- The build is unsigned, so first launch needs right-click then Open past Gatekeeper.

## Carried over, still open

- [ ] The `\&` escaping returns on every save through the rich editor (Milkdown serialiser).
- [ ] flash-lite omits the Sources footer on note-only answers. Pre-existing.
- [ ] No CI, deliberate. The staged-tree hook is the only gate.
- [ ] Optional: shell-guard hardening, README line for run-studio, jq vendoring for Windows.
