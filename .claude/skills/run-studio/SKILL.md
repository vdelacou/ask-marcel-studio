---
name: run-studio
description: Build, launch, and drive the Ask Marcel Studio Electron app to test the agent end to end. Use when asked to run the app, rerun an in-app agent eval, verify a prompt or agent change in the real app, or capture an agent conversation trace. One shot per run, launches the built app, starts a fresh conversation, optionally pins a model, sends a question, waits for the agent to finish, dumps the full thread text and a screenshot.
---

# Run and drive Ask Marcel Studio

The app is driven with the one-shot Playwright script alongside this file, `driver.mjs`
(playwright-core resolves from the repo's own node_modules, nothing to install; macOS,
real display, no xvfb). Each invocation launches the BUILT app, opens a fresh
conversation, sends one question, waits for the agent to finish, dumps the thread and a
screenshot, and quits. Prompt iteration loop: edit `resources/**`, rebuild, re-run,
grep the dump.

## Before every run

```bash
bun run build
pkill -f "electron-vite dev"; sleep 1; pkill -f "ask-marcel-studio/node_modules/electron"
```

Both steps matter. Resources (`resources/agent-core/core.md`, builtin skills) are read
ONCE at launch, so an already-running instance keeps pre-edit prompts and proves
nothing. And two instances share the same userData conversation store and gateway port,
so never run the driver next to a live dev instance.

## Run

```bash
node .claude/skills/run-studio/driver.mjs 'Who is the CIO of Celine?' cio-run1
MODEL_LABEL='Google · gemini-3.5-flash-lite' node .claude/skills/run-studio/driver.mjs '<question>' <tag>
```

- arg 1: the question typed into the composer.
- arg 2: tag naming the dump files.
- `MODEL_LABEL`: exact label from the composer's model picker (e.g. `LVMH · deepseek-v4-pro`);
  omit to keep the new conversation's default. The separator is a middle dot.
- `RUN_DIR`: output directory, default `<tmpdir>/ask-marcel-studio-runs`.

Outputs `<tag>.txt` (full thread innerText, every tool card in order) and `<tag>.png`.
Exit codes: 2 UI never ready, 3 no clean fresh thread, 4 send failed (a `-notready` /
`-notfresh` / `-sendfail` screenshot is written for each).

## Read the agent flow from the dump

Tool cards appear as title, tool name, status triples ("Search files for X / Bash /
Done"). Collapsed successful cards show only that; expanded or errored cards include
their JSON arguments (`subagent_type`, the delegation prompt). Grep for what a run must
and must not contain:

```bash
grep -n "^Agent$" run.txt                                  # delegations happened
grep -c "general-purpose\|python\|Reading .*json" run.txt  # expected 0
grep -n -B2 -A6 "Sources" run.txt                          # what the answer cited
```

## Gotchas (each cost a debugging round)

- The memory-elicitation dialog ("Marcel noticed a word…") queues across launches and
  its overlay intercepts all clicks; the driver Skips every queued one before typing.
- The Stop button flickers between agent steps; the driver's completion check needs 4
  consecutive absent polls. Dumping early and quitting KILLS the running turn.
- Sends fail silently when React state races the click; the driver verifies Stop
  appeared AND exactly one new question bubble exists, and exits 4 otherwise. A dump
  byte-identical to the previous run means the question landed in an old thread.
- Sidebar titles are CSS-truncated but complete in innerText: a grep count of the
  question includes one hit per old same-titled conversation plus one for the bubble.
- Every run is a real agent turn on the configured provider (it costs tokens) and
  leaves a conversation in the sidebar; delete test conversations in-app when done.
- Occurrence counts and answers vary with the pinned model; flash-lite is the weakest
  and therefore the honest floor for prompt-doctrine checks.

## After testing

```bash
bun run dev
```

Restart the user's dev instance so the app they see carries the tested build.
