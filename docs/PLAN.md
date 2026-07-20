# Ask Marcel Studio: implementation plan

A radically simplified Cherry Studio: add models (Anthropic and OpenAI compatible URLs), add skills, one agent-only conversation panel, with `ask-marcel-office-cli` available to the agent in every conversation.

## Context

Personal desktop AI app in the spirit of Cherry Studio, stripped to three surfaces. The agent must have `ask-marcel-office-cli` (read-only Microsoft 365 Graph CLI, 182 commands) available in every conversation. This repo is greenfield, built under the atelier engineering standard.

## Feasibility: confirmed

- Cherry Studio's agent is `@anthropic-ai/claude-agent-sdk` (pinned 0.3.185) invoked in the Electron main process. We imitate the architecture with fresh MIT code (Cherry is AGPL-3.0, no code copying).
- OpenAI-compatible providers work with the Anthropic-only SDK via Cherry's proven trick: a local loopback HTTP server implementing Anthropic `POST /v1/messages` that translates to the OpenAI API using the Vercel AI SDK. The SDK subprocess gets `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` and never knows.
- `ask-marcel-office-cli` is an npm package (`^2.2.0`) whose `dist/cli.js` runs under Node >= 20 (Electron's node qualifies). Bundle as a dependency, expose on the session PATH via a shim, teach usage via a built-in skill. Sign-in status via side-effect-free `scopes-check`; interactive `login` (Playwright browser) triggered only from a Settings button. **(M9 superseded the single skill: knowledge now ships as an always-on core prompt appended to the system prompt + two on-demand skills — `answer-from-m365`, `draft-outlook-email` — plus the `m365-reader` subagent; see `.claude/PLAN.md`.)**
- Skills are folders with SKILL.md loaded by the SDK from `CLAUDE_CONFIG_DIR/skills` with `settingSources: ['user']`. Each turn spawns a fresh SDK process, so added skills apply on the next message.

## Locked decisions and assumptions

| Decision | Choice |
|---|---|
| Shell | Electron + React (electron-vite), like Cherry |
| Agent engine | Claude Agent SDK, same as Cherry |
| Agent tools | Full bash + file tools, `permissionMode: 'bypassPermissions'`, no approval UI |
| atelier | Dev standard for building this repo, NOT preinstalled as an in-app skill |

Assumptions:

- No database. JSON files under Electron `userData`.
- One model picker per conversation (dropdown in header); default model in settings. No per-agent entities.
- Anthropic provider = API key + optional base URL (no Claude subscription login in v1).
- Conversation titles = truncated first user message (LLM titling is later polish).
- App name "Ask Marcel Studio", MIT license.

## Non-goals (v1)

No multi-window, tray, auto-update, i18n, custom theme system (Tailwind light/dark via `prefers-color-scheme` only), knowledge bases, MCP marketplace, assistants/agents marketplace, chat-vs-agent duality, subagents UI, scheduling, approval-gate UI, telemetry.

## Architecture

```
┌─ Renderer (React + Tailwind v4, zustand) ─────────────────┐
│  Sidebar (conversations) │ ChatThread + Composer │ Settings│
└──────────────▲──────────────────────────▲─────────────────┘
        IPC invoke (typed)         'chat:event' UIEvent stream
┌──────────────┴──────────────────────────┴─────────────────┐
│ Electron main                                              │
│  agent-runtime ── query() per turn ──► Claude Agent SDK    │
│  (resume via stored session_id)         subprocess         │
│      │ env: ANTHROPIC_* + PATH + CLAUDE_CONFIG_DIR         │
│      ├─ anthropic provider ──► provider base URL (direct)  │
│      └─ openai provider ────► local gateway :random port   │
│  gateway: /v1/messages (Anthropic wire) ─► Vercel AI SDK   │
│           ─► any OpenAI-compatible baseURL                 │
│  skills-service: userData/claude-config/skills/<name>/     │
│  office-service: scopes-check probe, login spawn           │
│  stores: settings.json, conversations/<id>.json            │
└────────────────────────────────────────────────────────────┘
```

## Toolchain and pins

- Bun = package manager + unit test runner (`bun test` on pure modules only; modules importing `electron` are excluded from unit tests).
- electron-vite (dev/build), electron-builder (packaging). Recorded as the sanctioned atelier deviation in `.claude/LESSONS.md`.
- Exact pin `@anthropic-ai/claude-agent-sdk@0.3.185` (no caret): env contract and options shape are load-bearing. `ai` + `@ai-sdk/openai` pinned at install time.
- package.json `trustedDependencies`: `electron`, `esbuild`, `@tailwindcss/oxide` (bun blocks postinstall by default; playwright's browser download staying blocked is desirable).
- atelier rules apply: arrow functions only, no classes/interfaces, `Result<T,E>` at IO boundaries, discriminated-union errors, TDD on pure logic, Tailwind sealed inside `components/**`, ESLint + SonarJS flat config, atelier git hooks. Scaffold via atelier-greenfield.

## Repo file tree (~60 source files, ~4k LOC app + ~1.1k tests)

```
ask-marcel-studio/
├─ package.json / bunfig.toml / tsconfig{,.node,.web}.json
├─ electron.vite.config.ts        # main, preload, renderer(+react, @tailwindcss/vite)
├─ electron-builder.yml           # v1: asar disabled (see R2)
├─ eslint.config.js / .githooks/  # atelier assets
├─ CLAUDE.md / .claude/LESSONS.md # atelier bootstrap
├─ resources/agent-core/core.md   # M9: always-on M365 core (system-prompt append)
├─ resources/builtin-skills/{answer-from-m365,draft-outlook-email}/SKILL.md  # M9 (was ask-marcel-office)
└─ src/
   ├─ shared/                     # zero electron imports
   │  ├─ types.ts                 # Conversation, Message, MessagePart, Provider, Settings
   │  ├─ ipc-contract.ts          # channel names + payload types + UIEvent union
   │  ├─ model-ref.ts (+test)     # parse/format 'providerId::modelId'
   │  └─ result.ts                # ok/err helpers
   ├─ main/
   │  ├─ index.ts                 # BrowserWindow + composition root
   │  ├─ paths.ts                 # userData layout + mkdir bootstrap
   │  ├─ services/
   │  │  ├─ store/json-file.ts            # atomic write (tmp+rename)
   │  │  ├─ store/settings-store.ts
   │  │  ├─ store/conversations-store.ts  # + workspace dir lifecycle
   │  │  ├─ agent/agent-runtime.ts        # query() per turn, run map, cancel, resume capture
   │  │  ├─ agent/session-env.ts (+test)  # pure env builder
   │  │  ├─ agent/sdk-event-fold.ts (+test) # SDK msgs → UIEvents + persisted parts (single fold)
   │  │  ├─ gateway/gateway-server.ts     # node:http, 127.0.0.1:0, auth, lazy start
   │  │  ├─ gateway/translate-request.ts (+test) # anthropic req → AI SDK params
   │  │  ├─ gateway/translate-stream.ts (+test)  # AI SDK fullStream → anthropic SSE events
   │  │  ├─ gateway/anthropic-sse.ts (+test)     # event → SSE wire string
   │  │  ├─ gateway/non-streaming.ts (+test)     # result → Message JSON + error envelopes
   │  │  ├─ skills/skills-service.ts      # list/add/remove/seed
   │  │  ├─ skills/skill-md.ts (+test)    # frontmatter name/description parse (no yaml dep)
   │  │  ├─ office/office-service.ts      # scopes-check probe, login spawn, single-flight
   │  │  └─ office/office-shim.ts (+test) # ELECTRON_RUN_AS_NODE shim writer
   │  └─ ipc/register.ts + ipc/emit.ts
   ├─ preload/index.ts            # contextBridge typed api + onChatEvent
   └─ renderer/src/
      ├─ main.tsx / app.tsx / globals.css     # Tailwind v4 @theme, light/dark
      ├─ lib/api.ts / lib/store.ts (zustand) / lib/ui-event-fold.ts (+test)
      ├─ lib/hooks/use-chat-events.ts / use-autoscroll.ts
      ├─ page/chat-page.tsx / page/settings-page.tsx
      └─ components/
         ├─ atoms/     button, icon-button, spinner, badge, text-input, select, markdown-view
         ├─ molecules/ conversation-item, chat-message, tool-call-card, model-picker,
         │             provider-form, skill-card, empty-state
         └─ organisms/ sidebar, chat-thread, composer, providers-panel, skills-panel, office-panel
```

Runtime userData layout:

```
<userData>/settings.json
<userData>/conversations/<id>.json
<userData>/workspaces/<conversationId>/     # per-conversation cwd
<userData>/claude-config/skills/<name>/     # CLAUDE_CONFIG_DIR
<userData>/bin/ask-marcel-office(.cmd)      # PATH shim
```

## Data model

```ts
type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool'; toolUseId: string; name: string; input: unknown;
      result?: string; status: 'running' | 'done' | 'error' };
type Message = { id: string; role: 'user' | 'assistant'; parts: MessagePart[]; createdAt: string };
type Conversation = { id: string; title: string; model: string; createdAt: string;
  updatedAt: string; sdkSessionId?: string; messages: Message[] };
type Provider =
  | { id: string; kind: 'anthropic'; label: string; baseUrl?: string; apiKey: string; modelIds: string[] }
  | { id: string; kind: 'openai';    label: string; baseUrl: string;  apiKey: string; modelIds: string[] };
type Settings = { providers: Provider[]; defaultModel?: string };  // 'providerId::modelId'
```

## IPC contract

Invoke channels (all payloads Result-shaped): `conversations:list/create/get/delete/rename/open-workspace`, `chat:send {conversationId,text}`, `chat:cancel`, `settings:get/save`, `skills:list/add/remove`, `office:status`, `office:login`.

Stream events, main to renderer on `chat:event`:

```ts
type UIEvent =
  | { type: 'turn-start';  conversationId; messageId }
  | { type: 'text-delta';  conversationId; messageId; delta }
  | { type: 'tool-start';  conversationId; messageId; toolUseId; name; input }
  | { type: 'tool-result'; conversationId; messageId; toolUseId; result; isError }
  | { type: 'turn-done';   conversationId; usage: { inputTokens; outputTokens; costUsd? } }
  | { type: 'error';       conversationId; message }
  | { type: 'title';       conversationId; title };
```

`sdk-event-fold.ts` is the single source of truth mapping SDK messages to BOTH UIEvents and persisted parts: `stream_event` text deltas append to the trailing text part; SDK `assistant` messages with `tool_use` append running tool parts; SDK `user` messages with `tool_result` resolve them; SDK `result` closes the turn and captures `session_id` + usage. Persist once per turn end (user message persisted at send). Thinking blocks dropped in v1.

## Agent runtime

Per turn:

```ts
query({ prompt: text, options: {
  model,                                   // modelId (direct) or 'providerId::modelId' (gateway)
  cwd: workspaceDir(conversationId),
  env: buildSessionEnv(...),               // pure, unit-tested
  systemPrompt: { type: 'preset', preset: 'claude_code' },
  settingSources: ['user'],                // loads CLAUDE_CONFIG_DIR skills
  permissionMode: 'bypassPermissions',
  includePartialMessages: true,
  resume: conversation.sdkSessionId,       // undefined on first turn
}})
```

`buildSessionEnv` always sets `CLAUDE_CONFIG_DIR=<userData>/claude-config`, `PATH=<userData>/bin:<inherited>`, `NO_UPDATE_NOTIFIER=1`. Anthropic provider: `ANTHROPIC_API_KEY`, optional `ANTHROPIC_BASE_URL` (trailing `/v1` stripped), plus `ANTHROPIC_MODEL` and `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` all pinned to the chosen model so background/fast-model calls cannot escape. OpenAI provider: `ANTHROPIC_BASE_URL=http://127.0.0.1:<gatewayPort>`, `ANTHROPIC_API_KEY=<per-run gateway key>`, same four model vars set to `providerId::modelId`.

One in-flight run per conversation (map keyed by id); `chat:send` during a run returns a typed error; cancel via `query.interrupt()` (verify exact name against installed 0.3.185 .d.ts at M2, fallback `AbortController`). Store `session_id` immediately from `system/init` AND `result` so a crash mid-turn still resumes. Zero providers: `chat:send` returns `err({kind:'no-provider'})`, UI shows a settings call-to-action.

## Gateway (OpenAI-compatible bridge)

- `node:http` server, loopback only, port 0 (OS-assigned, no collisions), started lazily on the first turn that needs it, stopped at app quit. Per-app-run random key; accepts `x-api-key` or `Authorization: Bearer`; constant-time compare.
- Routes: `POST /v1/messages` (streaming + non-streaming) and `POST /v1/messages/count_tokens` (chars/4 stub; delete at M5 if the CLI never calls it).
- Request translation (pure): anthropic system/messages/tools to AI SDK params. `tool_use` to assistant tool-call parts, `tool_result` to tool-role messages, tools to `jsonSchema(input_schema)` with no execute (passthrough), `tool_choice` mapped (`auto/any/tool`), strip `cache_control` and unknown blocks. Provider resolved from the `providerId::modelId` in the request's model field; `createOpenAI({ baseURL, apiKey }).chat(modelId)`.
- Stream translation (pure stateful reducer, the hardest correctness surface): emit exact Anthropic SSE order: `message_start`, then per block `content_block_start` / `content_block_delta` (`text_delta` | `input_json_delta`) / `content_block_stop`, then `message_delta {stop_reason, usage}`, `message_stop`. finishReason map: stop→end_turn, length→max_tokens, tool-calls→tool_use, else end_turn. If upstream yields whole `tool-call` parts (no deltas), emit one `input_json_delta` with the full JSON (legal per spec). Missing upstream usage defaults to 0. Upstream error becomes an SSE `error` event. Verify installed `ai` package's fullStream part names before coding the reducer (v4/v5 differ).
- Errors as Anthropic error envelopes: 401 bad key, 404 unknown provider, 502 upstream.

## Skills

- `skills-service` scans `claude-config/skills/*/SKILL.md`; `skill-md.ts` extracts frontmatter `name:`/`description:` (~20 lines, no yaml dep).
- Add = folder picker, validate SKILL.md exists, recursive copy (reject collisions). Remove = delete dir. Built-in office skill re-seeded on launch if missing or app version bumped; UI marks it builtIn and hides Remove.
- Fresh SDK process per turn means new skills apply next message; no hot-reload machinery.

## Office CLI integration

- Dependency `ask-marcel-office-cli@^2.2.0`. Its cli.js externalizes playwright, mammoth, xlsx, winston, etc., so those must exist as real files in the packaged app (drives the asar decision, R2).
- Shim, not `node_modules/.bin`: write `<userData>/bin/ask-marcel-office` (sh + .cmd) that execs `ELECTRON_RUN_AS_NODE=1 "<process.execPath>" "<abs path to cli.js>" "$@"` with `NO_UPDATE_NOTIFIER=1`. Rewritten every launch (paths change across updates). Works on machines without Node.
- Status: spawn `ask-marcel-office scopes-check --output json` (decode-only, no network/browser). Exit 0 gives scopes + expiry; exit 1 + JSON envelope means signed out.
- Login: Settings button spawns `login` with a 10-minute timeout (opens system Edge/Chrome via Playwright); single-flight lock; stderr progress surfaced in the panel. `login --force` behind a "reset session" affordance.
- Built-in skill (adapted from `ask-marcel-plugin/references/conventions.md`): discovery ladder (`--help`, `help-json --terse --category`, `docs <cmd>`), `--output json`, probe-first (`scopes-check` / `my-quick-context` before work), and on auth failure STOP and tell the user to click Login in Settings, never run `login` from the agent (doctrine, not enforcement, under bypassPermissions: accepted risk R8). **(M9: this content now lives in the always-on core prompt `resources/agent-core/core.md` and the two skills under `resources/builtin-skills/`; the auth doctrine and discovery ladder moved to the core.)**

## Renderer

- zustand single store (~150 lines): conversation metas, active conversation + messages, streaming flags, settings, `view: 'chat' | 'settings'` (no router).
- One `onChatEvent` listener at mount; pure `ui-event-fold.ts` (bun-tested) applies UIEvents to the store.
- `chat-message` maps parts to `markdown-view` (react-markdown + remark-gfm) and `tool-call-card` (native `<details>` showing name, input, result). Composer: textarea, Enter to send, Send/Stop swap.
- Tailwind v4 via `@tailwindcss/vite` in the renderer build; `@theme` tokens in globals.css; components stateless and props-only per atomic design. Shiki highlighting lazy-loaded at M7.

## Milestones

| # | Goal / definition of done | Verify |
|---|---|---|
| M0 Scaffold | atelier-greenfield bootstrap; git init; electron-vite + React + Tailwind skeleton; `bun install && bun run dev` opens styled window; lint/typecheck/test green; hooks installed; LESSONS.md seeded | window opens, HMR works, gates pass |
| M1 Storage + settings | settings.json + conversations CRUD + workspace dirs; Settings screen edits providers | bun tests on stores (temp dirs); settings survive restart |
| M2 Anthropic chat (FIRST DEMO) | streamed text + visible tool calls, persisted; resume after restart; cancel; zero-provider empty state | bun tests: session-env, sdk-event-fold, ui-event-fold (fixture arrays); live chat with real key; kill app mid-conversation then resume |
| M3 Skills | panel lists/adds/removes; built-in skill seeded; behavior change next turn | add a "pirate voice" test skill, next message obeys |
| M4 Office CLI | status probe + Login button end-to-end; agent runs `ask-marcel-office my-quick-context` in a conversation | before/after login status; agent executes a Graph command |
| M5 Gateway | an openai-compatible provider drives a full agent turn incl. tool use | exhaustive bun fixtures on both translators + SSE encoder; curl stream:false; live turn with bash tool |
| M6 Packaging | `bun run dist` produces a working mac arm64 DMG (chat, skills, office login, gateway) | packaged smoke test on a Node-less account. **M9 addendum: extraResources must ship BOTH `resources/agent-core` and `resources/builtin-skills`; verify the packaged `process.resourcesPath` split resolves core.md + both SKILL.md.** |
| M7 Polish | title event, shiki, rename/delete UX, error toasts, usage display, README | visual pass light + dark |

## Risk register (top items)

- R1 bun blocks postinstall: trustedDependencies for electron/esbuild/@tailwindcss/oxide; M0 verifies `node_modules/electron/dist` exists.
- R2 asar: SDK platform binary (`@anthropic-ai/claude-agent-sdk-darwin-arm64`), SDK cli + ripgrep vendor, office cli.js + 12 externalized deps and their transitive trees must be real files. v1 ships `asar: false` (correct and simple); asarUnpack optimization is a later ticket. Verified at M6.
- R3 SDK drift: exact pin 0.3.185; M2 step zero reads the installed .d.ts to confirm every option name (`systemPrompt` preset, `settingSources`, `resume`, interrupt).
- R4/R5 gateway SSE edge cases + `ai` v4/v5 stream part naming: pure reducer with exhaustive fixtures; verify part names against the installed package first.
- R7 skills reload: fresh process per turn assumed; cheaply confirmed at M3.
- R8 agent could invoke interactive `login` (browser popup): skill doctrine + single-flight lock; accepted residual risk.
- R9 gateway exposure: loopback only + per-run random key; accepted for a local personal app.
- R11 JSON corruption: atomic tmp+rename, one write per turn, one in-flight turn per conversation.

## Verification (end-to-end, after implementation)

1. `bun test` green (folds, translators, stores, parsers), lint + typecheck green, atelier gates pass.
2. Dev run: add Anthropic provider, chat, watch tool calls render, restart app, continue same conversation (resume works).
3. Skills: add test skill, confirm behavior next turn; remove it.
4. Office: scopes-check shows signed out, Login opens browser, status flips; in a conversation ask "what is in my inbox" and watch the agent drive `ask-marcel-office` via bash.
5. Gateway: configure an OpenAI-compatible provider, run a turn that uses bash (tool_use round-trips through the translator), compare with direct Anthropic behavior.
6. Package DMG and smoke test M2-M5 flows.
