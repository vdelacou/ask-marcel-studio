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

## Open, user-gated

- [ ] jargon.md: the user's real note vanished around 14:07 and what is on disk is a
      one-line reconstruction written by the agent for the UCR canary. Decide.
- [ ] The self-elicitation fix (2a9b796) is prompt-only and UNPROVEN live: it needs a
      background extraction run that would surface the user's own name.
- [ ] flash-lite omits the Sources footer entirely on note-only answers. Pre-existing,
      not a regression: the 14:00 run predating every prompt edit did the same.
- [ ] Two size-gate bypasses landed (bd763e5 at 304 lines, bd4949e at 481). Gates 2-8 were
      run by hand on both. A 300-line cap and a 369-line first test file are in real
      tension; worth a policy rather than a judgment call each time.
- [ ] No CI workflow at all. `.agents/skills/atelier/assets/ci.yml` is sitting untracked.
- [ ] Cleanup: ~20 test conversations in the sidebar from the eval runs.
- [ ] Optional: shell-guard hardening, README line for run-studio, jq vendoring if M6
      targets Windows.
