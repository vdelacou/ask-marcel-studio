# PLAN: Ask Marcel Studio M4 (office CLI)
Status: M4 code-complete, all eight gates green, awaiting commit. Shim verified live (the app
wrote it to <userData>/bin and running it returned signed-in scopes-check). Started 2026-07-19.
Unblocked by the user publishing `ask-marcel-office-cli@2.2.0` to npm.

M0-M3, M5, M7 are COMPLETE and pushed (public repo github.com/vdelacou/ask-marcel-studio).
M6 (packaging) remains blocked on Apple Silicon hardware. Lessons: `.claude/LESSONS.md`.

## Goal

Give the agent a working `ask-marcel-office` on its PATH, show sign-in status in Settings with
a Login button, and confirm the agent can drive a real Graph command in a conversation.

## Verified about the CLI (do not guess)

- Installed `ask-marcel-office-cli@2.2.0`, bin `ask-marcel-office` -> `dist/cli.js`.
- `scopes-check --output json` decodes the cached token LOCALLY (no network). Signed-in envelope:
  `{"ok":true,"data":{"scopes":[...],"expiresAt":"<iso>","expiresInSeconds":N,...}}`, exit 0.
  Signed-out is the CLI's `{"ok":false,"error":"..."}` convention (not observable here without
  clearing the real token; fixture is synthetic and the parser keys on `ok`, not the text).
- THIS machine is already signed in (valid token, future expiry), so the signed-in status path
  and the agent Graph command can be verified live here. Only the interactive login BUTTON needs a
  signed-out start; never run `logout` (it clears the user's real token) or data commands unasked.
- `login` opens an interactive browser (Teams web client). It is the user's job; the agent's skill
  already forbids it running `login` itself.
- Env wiring already exists: `paths.binDir` = `<userData>/bin`, and `session-env` already prepends
  it to the agent PATH. M4 only has to WRITE the shim there.

## Placement (coverage tiers, from check-coverage.ts)

- Pure logic -> `src/shared/` (100% tier + mutation): `office-shim.ts`, `office-status.ts`.
- Bun-testable service -> `src/main/services/office/office-service.ts`, add to `BUN_TESTABLE_MAIN`
  (80%), inject a `run` seam so no real child_process in tests; regen coverage-preload.
- IO shells (node:fs shim write, child_process run wrapper) -> thin, SKIPPED, wired in index.ts.

## Steps

1. [x] `build(deps)`: add ask-marcel-office-cli (uncommitted)  DoD met: ^2.2.0 in package.json
2. [x] `office-shim.ts` (+test, shared): pure sh + .cmd generator  DoD met: 100%, 3 tests
3. [x] shim writer (office-io) + wired into index.ts at launch (chmod +x)  DoD met: shim written + executable live
4. [x] `office-status.ts` (+test, shared): parse scopes-check  DoD met: 100%, 4 tests
5. [x] `office-service.ts` (+test, BUN_TESTABLE_MAIN): status + single-flight login + timeout  DoD met: 100%, 6 tests
6. [x] IPC office:status / office:login: contract (+pin test, signed off) + register + preload  DoD met: typecheck green
7. [x] `office-panel` organism + settings-page wiring: status + Login button  DoD met: lint green, props-only
8. [~] verify: shim resolves live (DONE — signed-in, 31 scopes via the shim); status probe + panel VISUAL and
       the agent-drives-a-Graph-command DoD still need the running app / a real turn (see gated below); README done

## Gated on the user (carried forward)

- The interactive login BUTTON end-to-end (signed-out -> browser -> signed-in) needs a signed-out
  start; the user drives it. Status + agent Graph command are verifiable now (machine is signed in).
- M7 live VISUAL pass still pending (screen capture blocked here; app boots clean).
- A live turn against the real Anthropic API + SDK resume, and M6 arm64 DMG, still need a key /
  Apple Silicon respectively.

## Discipline

TDD per slice; new tests for new code written as I go (shown), existing tests never touched without
sign-off (rule 24). Commit per green slice through the real hook, only on the user's yes (rule 25).
