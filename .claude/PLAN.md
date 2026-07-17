# PLAN: Ask Marcel Studio M0-M2 (scaffold through first demo)
Status: in progress. Started 2026-07-17. M0 and M1 complete (M1 unstaged, awaiting commit); M2 next.

## Goal

Build the first three milestones of `docs/PLAN.md`: an atelier-conforming Electron + React
scaffold, JSON storage plus a settings screen, and a working Anthropic-backed agent chat with
streamed text, visible tool calls, persistence, resume, and cancel. Stop at M2, the plan's
designated first demo, for user review before the gateway and packaging are built on top.

## Definition of done (whole task)

- `bun test` green; `bun run lint:strict` 0 errors 0 warnings; `bun run typecheck` clean;
  `bun run coverage` passes its per-tier gates; `bun run mutate` clears the 90% break threshold.
- `bun run dev` opens a styled window with HMR.
- Settings survive an app restart.
- A live Anthropic key streams text and renders visible tool calls into a persisted conversation.
- Killing the app mid-conversation and reopening resumes the same conversation.
- Tree staged with a proposed Conventional-Commits message, awaiting the user's yes (rule 25).

## Steps

### M0 Scaffold
1. [x] git init + repo-local neutral commit identity + `core.hooksPath`  DoD: `git config --local user.email` is the neutral one [met]
2. [x] Seed `CLAUDE.md`, `.claude/LESSONS.md`, `.claude/PLAN.md`, `.gitignore`  DoD: all exist, LESSONS carries the deviation entries [met]
3. [x] Copy atelier gate assets into `scripts/` + `.githooks/`  DoD: files present and executable [met]
4. [x] `package.json` + tsconfig split + `electron.vite.config.ts` + Tailwind v4 `globals.css`  DoD: `bun install` resolves; electron binary present [met — R1 obsolete, see LESSONS]
5. [x] Retune `COVERAGE_RULES` + stryker mutate globs for `src/{shared,main,preload,renderer}`  DoD: coverage + mutate pass [met — mutation 100%]
6. [x] `eslint.config.js` incl. a design-system block enforcing rules 21-22  DoD: lint:strict 0 errors 0 warnings [met]
7. [x] Walking skeleton: `src/shared/model-ref.ts` (+test) + BrowserWindow + styled React window  DoD: dev opens a styled window; bun test green [met — probed live: h1, preload bridge, shared kernel, @theme tokens all render]
8. [x] Verify the `commit-msg` hook rejects a junk message  DoD: junk exits non-zero [met — rejects junk/wip:/Fix:/trailing period, accepts valid]

### M1 Storage + settings

Both decisions resolved with the user 2026-07-17:

- **Store shape = pure core + IO shell.** Each store splits into a pure module in `src/shared/`
  (parse / validate / merge, 100% coverage + mutation tier) plus a thin electron-side shell that
  only reads and writes. The same split is what makes the M2 folds testable.
- **API key at rest = Electron `safeStorage`** (OS keychain), not plaintext.

Consequence of combining the two: encryption belongs in the IO **shell**, never the pure core, so
the core stays free of electron and never sees a plaintext key. The core's on-disk type therefore
carries an opaque envelope, NOT `docs/PLAN.md`'s `apiKey: string`:

```ts
// on disk (pure core owns this shape)         // in memory (after the shell decrypts)
{ apiKey: { enc: string } }                    { apiKey: string }
```

So `Provider` needs two shapes: a stored one and a runtime one. Do not let `safeStorage` leak into
`src/shared/**` — it would import electron and break the 100% tier (see LESSONS, bun test decision).
`safeStorage.isEncryptionAvailable()` can be false (no keychain); the shell must return a typed err,
not throw.

9. [x] `src/shared/types.ts` + `ipc-contract.ts`  DoD: typecheck green [met]
10. [x] `json-file.ts` atomic write (tmp+rename) + settings-store + conversations-store  DoD: bun tests pass against real temp dirs [met — json-file and conversations-store import no electron, so both are bun-tested against real temp dirs and gate-enforced; settings-store imports safeStorage and is verified live instead]
11. [x] Settings screen: providers CRUD  DoD: settings survive an app restart [met — drove the built app in two separate Electron processes against one userData: saved in process 1, reloaded and rendered in process 2, key decrypted via keychain]

### M2 Anthropic chat (FIRST DEMO)
12. [ ] Step zero: read the installed `@anthropic-ai/claude-agent-sdk@0.3.185` .d.ts and confirm every option name (`systemPrompt` preset, `settingSources`, `resume`, interrupt) (risk R3)  DoD: any divergence from `docs/PLAN.md` captured as a `[gotcha]` in LESSONS.md
13. [ ] `session-env.ts` (+test), pure env builder  DoD: bun test green incl. the model-var pinning cases
14. [ ] `sdk-event-fold.ts` (+test), SDK msgs to UIEvents + persisted parts  DoD: fixture-array tests green
15. [ ] `agent-runtime.ts`: query() per turn, run map, cancel, resume capture  DoD: one in-flight run per conversation enforced
16. [ ] IPC register/emit + preload contextBridge  DoD: renderer receives `chat:event`
17. [ ] Renderer: zustand store, `ui-event-fold.ts` (+test), chat-thread, composer, tool-call-card  DoD: streamed text + visible tool calls render
18. [ ] Zero-provider empty state  DoD: `chat:send` with no provider returns `err({kind:'no-provider'})` and the UI shows the CTA

## Notes / breadcrumbs

- M0 committed as `4e1ef2a` on 2026-07-17, with `--no-verify` (gate 1 size cap; sanctioned for an
  initial scaffold). Gates 2-8 were run manually and all passed before committing.
- Scope decided with the user 2026-07-17: M0-M2 only. M3-M7 explicitly out of scope this run.
- M1 starts at step 9. `src/shared/result.ts` already exists and is committed, so step 9 is really
  just `types.ts` + `ipc-contract.ts`.
- Office CLI: user publishes `ask-marcel-office-cli@2.2.0` to npm first. Blocks M4 only; not this run.
  npm latest is 2.1.0; local 2.2.0 is a symlink to `../ask-marcel-office-cli`.
- `ai` package is at v7.0.30, not the v4/v5 `docs/PLAN.md` assumed. Only matters at M5 (gateway);
  risk R4 says verify `fullStream` part names against the installed package before coding the reducer.
- Gate assets copied from `.claude/skills/atelier/assets/` (repo-local, not `~/.claude`).
- `format-error.ts` placed at `src/shared/utilities/` (asset assumes `src/domain/utilities/`).
- gitleaks IS installed, so pre-commit gate 3 runs for real rather than degrading.
- Two gated items need the user and cannot be done by the agent: the live-key chat test and the
  restart-resume test (both need a real Anthropic API key).
