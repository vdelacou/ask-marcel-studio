# PLAN: Ask Marcel Studio M3 (skills)
Status: M3 complete, unstaged and awaiting commit. Started 2026-07-17.

Previous plan (M0-M2: scaffold, storage + settings, Anthropic chat) is COMPLETE and committed
through `5ccc11a`. Its lessons live in `.claude/LESSONS.md`; the milestone list is `docs/PLAN.md`.

## Goal

Let the user add and remove agent skills, seed the built-in office skill on launch, and have a
newly added skill change the agent's behaviour on the next message. `CLAUDE_CONFIG_DIR` is already
wired and tested by `session-env.ts`, so this milestone is mostly the service, the panel, and the
proof that the SDK actually loads what we write.

## Definition of done (whole task)

- All eight gates green; the final slice commits through the real hook with no bypass.
- Skills panel lists, adds and removes; the built-in office skill is seeded and cannot be removed.
- A skill added through the UI is loaded by the agent on the NEXT message (fresh SDK process per
  turn means no hot-reload machinery is needed — risk R7, cheap to confirm here).
- `bun run dev` still opens and chats.

## Steps

1. [x] `src/shared/skill-md.ts` (+test)  DoD: bun test green, 100% tier [met — 18 tests; also parses all 4 real vendored skills, descriptions up to 1022 chars intact]
2. [x] `resources/builtin-skills/ask-marcel-office/SKILL.md`  DoD: exists, parses [met — every command and flag it names was verified against the installed CLI first]
3. [x] `skills-service.ts`  DoD: bun-testable [met — imports no electron (the picker lives in the IPC layer), so 15 tests against real temp dirs, gate-enforced]
4. [x] IPC `skills:list/add/remove` + preload  DoD: typecheck green [met — the picker opens in MAIN; the renderer never names a path]
5. [x] Skills panel  DoD: renders [met — built-in seeds on launch, is marked, and its Remove button is hidden rather than shown-and-refusing]
6. [x] Verify R7  DoD: skill reaches the API request [met — planted a marker in the description and found it in the captured 101KB turn payload, alongside the built-in office skill. No restart needed]

## Verified live (capturing what the agent actually sends)

- Built-in office skill seeds on launch; removing it is refused with kind `built-in`.
- A skill copied in after launch reaches the VERY NEXT turn's API payload. R7 confirmed:
  fresh SDK process per turn, so no hot-reload machinery and no restart prompt.
- CLAUDE_CONFIG_DIR isolates: none of the developer's own ~/.claude skills reach the app's
  agent. The SDK's OWN bundled skills (code-review, verify, run, deep-research) DO load via
  the claude_code preset — expected, but the panel does not list them.

## Notes / breadcrumbs

- The folder picker needs `dialog.showOpenDialog` from electron, so the service will import
  electron and fall OUT of the bun-testable set. Keep the pure part (validation, collision
  detection) in `src/shared/` so it stays gated, exactly like the stores.
- Verification without a key: `scripts/fake-anthropic.mjs` logs what the agent sends. A loaded
  skill's name/description reaches the API in the request payload, so R7 is provable by grepping
  that body — no live model needed.
- Skills apply on the NEXT message because each turn spawns a fresh SDK process (docs/PLAN.md).
  That is the assumption R7 asks to confirm; if it is wrong, the panel needs a restart prompt.
- The built-in skill is doctrine only, not enforcement: under `bypassPermissions` the agent CAN
  run `ask-marcel-office login`. That is accepted risk R8 in docs/PLAN.md.
- M4 (office CLI) stays blocked until `ask-marcel-office-cli@2.2.0` is published to npm. The
  built-in SKILL.md is just markdown, so it does not need the CLI installed and lands here.

## Gated on the user (unchanged from M0-M2)

- A live turn against the real Anthropic API, and SDK-level resume. The fake proves the wiring,
  not the model. Both need a real key.
- M6 targets a mac arm64 DMG, but this machine is Intel x64. Decide the target arch before M6.
