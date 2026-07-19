# PLAN: Ask Marcel Studio M7 (polish)
Status: M7 code-complete, all eight gates green, awaiting commit. Live visual pass pending
(computer-use screen capture is blocked in this environment; app boots clean with no console
errors). Started 2026-07-18.

M0-M3 and M5 are COMPLETE and committed (M5 through `3fc5d6c`). M4 (office CLI) and M6
(packaging) remain BLOCKED on the user (see Gated below). Lessons: `.claude/LESSONS.md`.

## Goal

Finish the app's user-visible surface so it reads as done. M7's six one-liners in
`docs/PLAN.md` decompose into three real chunks plus a README audit, because two of them
(rename/delete UX, shiki) presuppose surfaces that were deferred and never built.

## What already exists (do NOT rebuild)

- `title` is emitted on the first turn (`agent-runtime.ts:133`), folded into `ChatView.title`
  (`ui-event-fold.ts`), but never RENDERED. AppFrame shows a hardcoded "Ask Marcel Studio".
- `usage` is folded into `ChatView.lastUsage`, never rendered.
- `error` is already rendered as an inline `role="alert"` banner in `chat-thread`. It works.
  "Toasts" is only worth it where an action has no inline home (rename/delete/settings-save
  failures) — fold that into chunk B, do not gratuitously replace the working banner.
- Assistant text renders as a plain `<p whitespace-pre-wrap>`. No markdown, no `react-markdown`,
  no `shiki` in deps yet.
- The app opens exactly ONE conversation (`app.tsx`). No sidebar, no list, no new/switch. The
  `conversations.rename`/`.remove` IPC exists but nothing in the UI calls it.

## Steps

### Chunk A — render title + usage (small; state already folded)
1. [x] `format-usage.ts` (+test) pure formatter TurnUsage -> compact string  DoD met: 3 tests, 100%
2. [x] `conversation-header` molecule (props-only: title, usage summary)  DoD met: lint green, no hooks/src imports
3. [x] wire header into ChatPage from `view.title` + `formatUsage(view.lastUsage)`  [live visual pending]

### Chunk B — conversation sidebar (large; the deferred M2 feature)
4. [x] pure conversation-list fold (+test): add/rename/remove/select/retitle  DoD met: 10 tests, 100%
5. [x] `use-conversations` hook wiring the list IPC + the fold  [moved to src/renderer/src/hooks, NOT lib: lib is the 100% tier and a hook is not bun-testable]
6. [x] design-system: `conversation-item` molecule + `sidebar` organism (list, new, active, inline rename, inline delete-confirm)  DoD met: props-only, lint green
7. [x] wire sidebar into AppFrame/app shell; switch active conversation  [live visual pending]
8. [x] error surface for rename/delete failures = `toast` molecule wired to hook.error  DoD met

### Chunk C — markdown + shiki (medium; new deps + a sanitization boundary)
9. [x] approach: shiki `createHighlighterCoreSync` (sync singleton, curated langs) + `@shikijs/rehype/core` inside react-markdown; emits React elements, NO html sink (rule 12 clean). "lazy-loaded" -> sync-bundled (sanctioned deviation)
10. [x] added react-markdown, remark-gfm, shiki, @shikijs/{rehype,langs,themes}; `markdown-view` atom  DoD met
11. [x] wire markdown into chat-message assistant text; code blocks highlighted; dual-theme via globals.css  [live visual pending]

### Chunk D — README + close
12. [x] README audit: status blurb, layout (hooks/render dirs) updated  DoD met
13. [~] gates: typecheck + lint + test(423) + coverage all green locally; production build succeeds; commits NOT yet made (awaiting user yes, rule 25)

## Remaining before M7 is truly done
- Live VISUAL/interactive pass: sidebar create/switch/rename/delete, markdown+shiki render (light+dark),
  usage+title display. Blocked here by screen-capture permission; app boots clean. Needs the user's eyes
  or a working capture, ideally with the fake-anthropic stub for a real turn (usage/title need a turn).
- Commit the work in gate-sized slices (plan below), then propose LESSONS entries.

## Notes / discipline

- TDD per slice (rule 11/24): propose the failing test, get a yes, then write it. Never touch an
  existing test without sign-off.
- Design-system components are props-only, no hooks, no `src/lib`/`src/shared` imports (rule 21);
  Tailwind stays sealed under `src/components/**` (rule 22).
- Commit per coherent green slice, <=10 files / <=300 lines, Conventional Commits, only on the
  user's explicit yes (rule 25).
- Not fanning this out to parallel agents: the work is sequential and gated (test + commit
  confirmations), so it is driven inline.

## Gated on the user (carried from M5, unchanged)

- A live turn against the real Anthropic API, and SDK-level resume. Both need a real key.
- M4 needs `ask-marcel-office-cli@2.2.0` on npm (registry latest is 2.1.0).
- M6 targets a mac arm64 DMG; this machine is Intel x64, so the arm64 smoke test needs real
  Apple Silicon hardware.
