# PLAN: Ask Marcel Studio M10 (the app an office employee can live in)

Status: **COMPLETE and committed** on `feat/m365-builtin-pack`, 2026-07-21. Branch tip green on
`bun test` (1195), `typecheck`, `lint:strict`, `coverage`, `build`, and `mutate:staged` on every
commit touching mutation scope. Not merged; never run against a live mailbox.

Source: the user's 20 features, planned in `~/.claude/plans/if-multiple-model-lively-pillow.md`
and approved before any code. All twenty are in; the ones that changed how the app feels:

- **The conversation no longer disappears** when you switch away mid-answer (`lib/chat-cache`,
  `use-chat-views`, plus a `turn-saved` event, because `turn-done` fires before the save).
- **Tool calls say what they are doing** ("Reading your last 5 emails"), and a delegated helper
  shows its steps.
- **The shell is guarded** (`bash-guard`, `agent-hooks`): no deleting outside the conversation's
  own folder, no touching the machine, no signing in to Microsoft 365 for you.
- **Microsoft 365 is switchable by area**, and the panel says what was granted in words.
- **Skills, helpers, signature, writing voice and the notes** are editable in Settings, in one
  three-mode editor, with built-ins restorable.
- **The app remembers the user's vocabulary**, and never without asking.

## Decisions taken with the user (2026-07-21)

1. **Authorization is per category, not per command.** 184 commands is not a screen; 11 is.
2. **Invisible guardrails, no approval dialog.** The app is for people who cannot judge
   `rm -rf ~/Documents`; a prompt would teach clicking yes. See LESSONS for the consequences.
3. **Memory extracts on idle, asks politely.** Five minutes of silence, then a question only
   when no turn is running and nothing is half-typed.
4. **People are enriched from the directory first**, so the user confirms a fact, not a guess.

## Deviations from the approved plan

- No `readResourceText` helper: `agent-core-io`'s read was generalised to `readBundledText`.
- The guard's `find` rule treats every path-shaped argument as a root rather than parsing find's
  grammar. More conservative, and it removed code no test could distinguish.
- The guard's opaque rule scans the whole command, not the segment, because `(` ends a segment
  before the substitution is seen. It refuses a few harmless lines; the header says so.

## Gated on the user (needs a running app and a signed-in account)

Code-complete and gate-green, never run for real: a PreToolUse denial reaching the model under
`bypassPermissions` and the hook firing for the `m365-reader` subagent; `get-mail-signature
--output-path` with no `--message-id`; the voice profile and memory extraction end to end (both
spend tokens); Milkdown Crepe on screen (it builds; CSP may need `font-src 'self' data:`); and
`webUtils.getPathForFile` for a real drop.

## Next

Merge to `main`. Then M6 packaging: `resources/background/**` needs an `extraResources` entry
beside `agent-core` and `builtin-skills`, `commands.json` rides the same asar probe, and the
5 MB renderer chunk (Milkdown plus Shiki) is worth a look first.
