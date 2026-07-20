# Ask Marcel Studio

A personal desktop AI studio: add models, add skills, and talk to one agent that always has
your Microsoft 365 in reach. A radically simplified Cherry Studio, stripped to three surfaces.

Electron + React, MIT licensed. Built to the atelier engineering standard.

> **Status: M5 complete, M7 polish landing — chat, skills, any OpenAI-compatible model.** Add a
> provider in settings (Anthropic, or any OpenAI-compatible endpoint) and you get a working agent
> conversation: replies rendered as markdown with syntax-highlighted code, visible tool calls it
> actually executes, a persisted transcript that survives a restart, and a Stop button. A sidebar
> lists your conversations, and lets you start, switch, rename, and delete them; each turn's token
> usage shows in the header. Settings also manages skills and your Microsoft 365 sign-in: a skill you
> add applies from your next message, and once you sign in, the agent reads your mail, calendar, files
> and tasks through the read-only office CLI on its PATH. Only packaging (M6) is not built yet. See
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

`ask-marcel-office` ships with the app: it teaches the agent to read your Microsoft 365 through
the read-only CLI, and to send you to Settings rather than trying to sign in itself. It is
re-seeded on every launch, so it cannot be removed and an update always ships the current version.

`node`, `npm`, and `npx` are on the agent's PATH too, with no Node install on the machine: the
app's own Electron binary runs as Node (`ELECTRON_RUN_AS_NODE`), and the bundled `npm` keeps its
global installs and cache inside the app's data folder. The shims are re-seeded every launch.

Two things the panel does not show: the agent also gets the SDK's own bundled skills (code-review,
verify, run, and friends) via the `claude_code` preset, and your personal `~/.claude` skills are
deliberately **not** loaded — the app points the agent at its own config directory.

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
