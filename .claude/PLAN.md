# PLAN: branch feat/m365-builtin-pack, current state (2026-07-23)

No task in flight. Completed on this branch today, all gates green (1355 tests, lint,
typecheck, build), verified live in the app via .claude/skills/run-studio:

1. [x] Role→person routing + scoped-title/two-source/tenant-first rules (core.md, skill)
2. [x] doc-reader + mail-reader replace m365-reader; delegation forced; generic CLI
       subagents withdrawn via Task() deny rules
3. [x] Extraction doctrine: redirect + Grep/grep/awk, no jq dependency, no read-backs
4. [x] Subagent steps persisted as child parts (parentToolUseId), rendered nested in
       the Agent card live and after reopen; result bodies included
5. [x] conversation-doc loader keeps parentToolUseId (was stripping it on load)
6. [x] tool-label: Skill reads the `skill` key; Agent tool name labels by description
7. [x] Prompt hardening: bare `ask-marcel-office` only (no absolute paths, no npx, no
       silencing); local disk out of bounds for readers

Pending, user-gated: commit slices + atelier-review-me before landing; consider a
stronger default model than gemini-3.5-flash-lite; optional shell-guard hardening
(block reads outside workspace/scratch) and a README line for run-studio.
