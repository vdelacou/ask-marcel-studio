# PLAN: branch feat/m365-builtin-pack, state after the 2026-07-23 evening session

No task in flight. The working tree is CLEAN for the first time on this branch, and
HEAD is verified green in a detached worktree: typecheck, 1373 tests, lint, coverage.

## What this session did

Started from "kill the mutation survivors in translate-request", which it did (31 to 0,
score 90.28 to 100.00). Everything after came out of what that uncovered.

Landed, oldest first:

- f50bf22 survivor-killing tests for translate-request
- 6e9702b one glossary block per note, note titles dropped, `*`/`+` bullets read
- 52bd7f3 a new conversation opens on the model last used
- 3ec554e editor mode tabs dropped, each panel states its own
- 832d011 the note length cap removed
- e4c016e up arrow recalls an earlier message into the composer
- 2a9b796 notes cited by the user's name for them, never asked about the user
- ac28844 the pre-commit typecheck now reads the STAGED tree
- 508e340 two LESSONS entries
- 7d6c326 tool schemas trimmed to Google's Schema proto
- bd763e5 Gemini thought signatures carried across the Anthropic round trip
- bd4949e every upstream call gets a deadline; openai-compatible provider
- b9e066e main, not the renderer, picks a new conversation's model
- 26493b9 columns grow with the window, stop at a reading width
- b3b8a87 400 no longer reported as a bad model name

## The thing worth remembering

HEAD did not compile for seven commits and nobody could have noticed. The pre-commit
gate ran `bun run typecheck` over the WORKING TREE, where the missing halves were sitting
unstaged. Found only by `git worktree add --detach HEAD`. Fixed in ac28844
(`scripts/check-staged-typecheck.sh`, materialises the index with write-tree + archive).
There is still NO CI in this repo, so that hook is the only gate that exists.

## A wrong claim, corrected

Earlier in this session the agent reported that the user's `jargon.md` had been lost. That
was WRONG and nothing was ever lost. Notes live at `claude-config/memory/` (paths.ts:62)
while the queue and state live at `userData/memory/` (paths.ts:68). Only the second was
looked at, and the absence of notes there was read as data loss. The real notes were intact
throughout, and the UCR canary had been quoting them all along. The reconstruction written
into `userData/memory/jargon.md` was a stray the app never reads; it has been moved out.

Rule for next time: two directories named `memory` under one userData is a trap. Read
paths.ts before concluding anything about a file's absence.

## Closed this session

- Size gate no longer counts test files (64752bf). Replayed: the two commits that needed a
  bypass come to 102 and 112 production lines.
- `IS\&T` fixed in jargon.md and team.md, 8 occurrences. Cause found: Milkdown's serialiser
  escapes `&` when it could open an HTML entity, and markdown-editor.tsx passes its output
  straight through. It will come back on the next save through the rich editor.
- Four eval conversations moved out of the store; the six that remain are the user's.
- Self-elicitation: extraction ran on a fresh transcript naming the user as a forwarder
  (extractedMessageCount 2 at 12:03:44Z) and queued NOTHING, which is the wanted outcome.
  Honest limit: an empty queue cannot distinguish "recognised the user and dropped them"
  from "the identity lookup failed and it fell closed". Both are the fix working as
  designed, but they are different paths and nothing logs which one ran.

## Open

- [ ] The `\&` escaping returns on every save through the rich editor. A durable fix means
      either configuring Milkdown's serialiser or unescaping on the way out of
      markdown-editor.tsx; the latter is a one-line change with a real edge case.
- [ ] flash-lite omits the Sources footer entirely on note-only answers. Pre-existing,
      not a regression: the 14:00 run predating every prompt edit did the same.
- [ ] No CI, decided deliberately for now: the hook reads the staged tree, which was the
      hole that mattered. Nothing catches a `--no-verify` commit or a clone where
      core.hooksPath was never set. `.agents/skills/atelier/assets/ci.yml` sits untracked.
- [ ] Optional: shell-guard hardening, README line for run-studio, jq vendoring if M6
      targets Windows.
