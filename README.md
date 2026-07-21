# Ask Marcel Studio

A personal desktop AI studio: add models, add skills, and talk to one agent that always has
your Microsoft 365 in reach. A radically simplified Cherry Studio, stripped to three surfaces.

Electron + React, MIT licensed. Built to the atelier engineering standard.

> **Status: M10 complete — the app an office employee can actually live in.** Add a provider in
> settings and you get a working agent conversation: replies as markdown, tool calls labelled in
> plain words ("Reading your last 5 emails") rather than by tool name, delegated helpers showing
> their steps, a transcript that survives switching away mid-answer, and a Stop button. The sidebar
> marks which conversations are thinking and which have a reply you have not read. Attach files with
> the + button or by dropping them anywhere on the conversation; type `/` to invoke a skill by name;
> pick a different model per conversation when you have more than one.
>
> Settings is where the rest lives: models, skills (editable, including the built-in ones, with the
> original a click away), the helpers the agent delegates to, your email signature and writing voice,
> what the app remembers about your own vocabulary, and Microsoft 365, where you can switch off whole
> areas the agent may not touch. A dot beside Settings says whether your sign-in is actually working.
>
> The agent's shell is guarded: it cannot delete outside the conversation's own folder, touch the
> machine, or sign in to Microsoft 365 on your behalf. Only packaging (M6) is not built yet. See
> `docs/PLAN.md` for the milestone plan and `.claude/PLAN.md` for the current run.

## Requirements

- [Bun](https://bun.sh) 1.3+ (package manager and unit-test runner)
- macOS. The plan targets a mac build; nothing here is Windows- or Linux-tested.
- Node on `PATH`, for `bun run mutate` only. Stryker cannot run under Bun's runtime; it works
  because `bun run` delegates to real node. Everything else is Bun-only.
- Optional: `gitleaks` for pre-commit gate 3 (`brew install gitleaks`). The hook warns and
  continues without it.

Running the app needs no separate Node install: Electron ships its own runtime. It has no
postinstall, so `bun install` is fast and the ~124MB binary downloads on the first `bun run dev`
instead (about two minutes, once).

## Install and run

```bash
bun install     # electron downloads its binary lazily on first `dev`
bun run dev     # opens the app with renderer HMR
```

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | electron-vite dev server + launches Electron, renderer HMR |
| `bun run build` | production build into `out/` |
| `bun run start` | launch Electron against the production build |
| `bun test` | unit tests (pure modules only — see Testing) |
| `bun run lint` | fast ESLint, 0 warnings tolerated |
| `bun run lint:strict` | adds type-aware rules (~25s); what pre-commit gate 5 runs |
| `bun run typecheck` | `tsc --noEmit` across both tsconfig projects |
| `bun run typecheck:node` / `typecheck:web` | one project each (main+preload+shared / renderer) |
| `bun run coverage` | per-tier coverage gate |
| `bun run mutate` | Stryker mutation testing (break threshold 90; needs node on PATH) |
| `bun run mutate:changed` / `mutate:staged` | mutation on changed / staged files |

Delete `reports/stryker-incremental.json` before trusting a mutation score you just tried to
improve: the incremental cache reports stale survivors after a test change.

## Layout

```
src/shared/       pure kernel, zero electron imports, 100% coverage tier
src/main/         electron main process
  index.ts        composition root: reads userData + clock once, injects downward
  ipc/            channel wiring; every handler returns a Result
  services/store/ IO shells around the pure document modules in src/shared
src/preload/      contextBridge typed api — the renderer's only door to main
src/renderer/     React + Tailwind v4
  src/components/ design system (atoms, molecules, organisms): all styling lives here
  src/lib/        renderer logic (pure, tested — the 100% coverage tier)
  src/hooks/      React hooks (impure wiring; skipped tier, like components)
  src/render/     markdown + shiki rendering (app-side, injected into the design system)
  src/page/       page shells: own all state, carry no class strings
  src/styles/globals.css                            design tokens (@theme)
src/test-helpers/ test-only helpers; never imported by production code
scripts/          atelier gate scripts
.githooks/        pre-commit (8 gates) + commit-msg (Conventional Commits)
docs/PLAN.md      the full 7-milestone plan
.claude/          PLAN.md (current run), LESSONS.md (append-only memory)
```

## Skills

Settings manages the agent's skills. A skill is a folder with a `SKILL.md` whose frontmatter
carries a `name` and a `description`; the whole folder is copied into
`<userData>/claude-config/skills/`, which is what the agent reads.

A skill you add applies from your **next message** — each turn spawns a fresh agent process, so
there is nothing to reload and no need to restart.

Microsoft 365 knowledge ships with the app as a built-in pack. A compact **core** loads into
every turn (what the read-only `ask-marcel-office` CLI is, how to route a question, and to send
you to Settings rather than trying to sign in itself), and two on-demand skills carry the deep
procedure: **answer-from-m365** (search, read mail, read documents, people) and
**draft-outlook-email** (prepare an unsent reply, forward, or new draft). A third piece, the
**m365-reader** subagent, reads one oversized artifact (a long deck, a many-sheet workbook, a
zip of scans) in full and hands back a summary, so the main conversation stays clear. The two
skills are re-seeded every launch (so they cannot be removed and an update ships the current
version); the earlier single `ask-marcel-office` skill is retired automatically on upgrade.

`node`, `npm`, and `npx` are on the agent's PATH too, with no Node install on the machine: the
app's own Electron binary runs as Node (`ELECTRON_RUN_AS_NODE`), and the bundled `npm` keeps its
global installs and cache inside the app's data folder. The shims are re-seeded every launch.

`python3` and `pip3` are there as well. The app bundles a standalone CPython (Astral's
python-build-standalone) and, on first launch, builds a private virtualenv under its data folder,
so the agent can crunch a CSV with nothing installed on the machine. Nothing is preinstalled into
it: naming a fixed set of libraries only implied a limit that does not exist, and the agent
installs whatever a task needs. The venv is rebuilt when the runtime version changes. Fetch the
runtime for local dev with `bun run fetch:python`.

Two things the panel does not show: the agent also gets the SDK's own bundled skills (code-review,
verify, run, and friends) via the `claude_code` preset, and your personal `~/.claude` skills are
deliberately **not** loaded — the app points the agent at its own config directory.

## What the app does on its own

Three things happen in the background, one at a time, and each skips itself when there is
nothing to do:

- **Your signature.** Fetched from your mailbox the first time you are signed in. Never
  overwritten once you have edited it.
- **Your writing voice.** Written once from your own sent mail, so a draft sounds like you.
- **What your words mean.** A conversation that has been quiet for five minutes is read for
  jargon, team members and people you deal with. Nothing is ever remembered without you
  confirming it: the app asks, one question at a time, when you are not mid-sentence.

All three are files in the agent's config folder, editable in Settings, and read back into every
turn.

## Guardrails

The agent has a real shell, which is what makes it useful and also what makes "tidy those files
up" a sentence worth thinking about. A hook checks every command before it runs and refuses the
few shapes that cannot be undone: deleting outside the conversation's own scratch folder, disk
and system tools, recursive permission changes, and anything computed inside a substitution that
mentions one of them. Deleting inside the workspace is the agent's own business.

It also cannot sign you in to Microsoft 365: that browser window belongs to you, in Settings.

There is no approval dialog anywhere. A refusal has to be rare enough never to block ordinary
work, and the agent explains it to you in its own words and carries on.

## OpenAI-compatible providers

An `openai` provider does not talk to the model directly. The main process runs a loopback
gateway that speaks Anthropic's wire protocol to the agent and translates to the OpenAI API:

```
agent subprocess ──Anthropic wire──▶ gateway (127.0.0.1, OS-assigned port)
                                       └──OpenAI wire──▶ your endpoint
```

The agent never sees your provider's key — it authenticates to the gateway with a per-run key,
and the real credentials stay in the main process. The gateway starts on the first turn that
needs it, so an Anthropic-only setup never opens a socket.

## Trying it without an API key

Two stand-in endpoints let the whole thing be exercised with no credentials. Everything except
the model is real: real SDK, real agent subprocess, real tool execution, real IPC.

```bash
# an Anthropic stand-in, for the agent path
node scripts/fake-anthropic.mjs   # prints FAKE_PORT <port>
# an OpenAI-compatible stand-in, for the gateway path
node scripts/fake-openai.mjs      # prints FAKE_OPENAI_PORT <port>

bun run dev   # add a provider with baseUrl http://127.0.0.1:<port> and any key
```

Both answer the first turn with text plus a `Bash` tool call, and the second (once they see the
tool result) with a closing line — so a full tool round trip runs end to end.

## How a setting reaches disk

Worth knowing before changing the stores, because the split is deliberate:

```
settings screen → draftsToSettings (lib) → IPC → settings-store (shell)
                                                   ├── validateSettings   (pure, src/shared)
                                                   ├── seal via safeStorage  ← the ONLY place
                                                   └── writeJsonFileAtomic   keys are encrypted
```

The pure core never sees a plaintext key and never imports electron, which is what keeps it in
the 100% coverage tier. On disk an API key is `{"enc":"…"}`, never the key itself.

## Testing

`bun test` covers **pure modules only**. The Bun test runner has no Electron runtime, so a test
importing `electron` crashes it. Logic that deserves a test therefore lives in `src/shared/**`
or in a named pure module that never imports electron.

Design-system components under `src/renderer/src/components/**` are deliberately not unit-tested:
they are prop-in/JSX-out by construction (atelier rule 21) and are verified by lint and review.

## Contributing

This repo follows the [atelier](.claude/skills/atelier) standard. Before changing anything:

- `.claude/PLAN.md` — the current plan; resume from its first unchecked step.
- `.claude/LESSONS.md` — append-only memory. Several non-obvious traps are recorded there
  (the vite/plugin-react peer triangle, the `.mjs` preload path, Stryker's incremental cache).
- Commits are Conventional Commits, enforced by a hook. Run `git config core.hooksPath .githooks`
  once per clone.
