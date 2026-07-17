# CLAUDE.md

This repo follows the atelier coding standard. Consult the `atelier` skill for every
code task here; its hard rules 1-34 bind (TDD with hand-written fakes, `Result` at IO
boundaries, branded types at trust boundaries, and the production disciplines: privacy,
isolation, reliability, observability). Run the `atelier-review-me` skill before landing
changes. Journals: `.claude/LESSONS.md` (append-only memory), `.claude/PLAN.md` (current plan).

## What this is

Ask Marcel Studio: a personal Electron desktop AI app. A radically simplified Cherry Studio
with three surfaces: models (Anthropic + OpenAI-compatible), skills, and one agent-only
conversation panel. The agent has `ask-marcel-office` (read-only Microsoft 365 Graph CLI)
available in every conversation.

Full implementation plan: `docs/PLAN.md`. Current run: `.claude/PLAN.md`.

## Variant

Not one of atelier's three canonical variants. This is a documented hybrid:

- **Bun-script base** for gates, `Result`, git hooks, ESLint + SonarJS flat config.
- **Next.js variant rules 21-22** (logic-free design system, Tailwind sealed inside
  `src/renderer/src/components/**`) for the renderer, despite there being no Next.js.

See `.claude/LESSONS.md` for the sanctioned deviations and why each was taken.

## Layout

```
src/shared/     zero electron imports, pure, 100% coverage tier
src/main/       electron main process (composition root, services, IPC)
src/preload/    contextBridge typed api
src/renderer/   React + Tailwind v4; design system under src/components/**
```

`src/shared/**` is the only tier `bun test` covers by default: modules importing `electron`
are excluded from unit tests (the runner has no electron runtime). Pure logic therefore
lives in `shared/`, or in named pure modules that never import electron.
