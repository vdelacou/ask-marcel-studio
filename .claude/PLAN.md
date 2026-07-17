# PLAN: Ask Marcel Studio M5 (OpenAI-compatible gateway)
Status: M5 complete, unstaged and awaiting commit. Started 2026-07-17.

M0-M3 are COMPLETE and committed through `b968a5e`. M4 (office CLI) is BLOCKED on the user
publishing `ask-marcel-office-cli@2.2.0` to npm, so M5 is taken first. Lessons: `.claude/LESSONS.md`.

## Goal

Let an OpenAI-compatible provider drive a full agent turn, tool use included. A loopback HTTP
server speaks the Anthropic wire protocol to the SDK and translates to the OpenAI API via the
Vercel AI SDK. The agent subprocess gets `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` and never
knows.

## Step zero (risk R4) — DONE, and it changes the design

The installed `ai` is v7, not the v4/v5 `docs/PLAN.md` assumed. Verified against the installed
.d.ts, `fullStream` yields:

  text-start / text-delta (field `text`, NOT v4's `textDelta`) / text-end
  tool-input-start (id, toolName) / tool-input-delta (id, delta) / tool-input-end
  tool-call (the whole call, ALSO emitted)
  start / start-step / finish-step / finish (finishReason, totalUsage) / error / abort

So v7 streams tool arguments natively and maps almost 1:1 onto Anthropic's wire format. Two
consequences the plan did not anticipate:
- `tool-call` arrives IN ADDITION to the input deltas. Folding both double-emits the tool — the
  same trap as the assistant message repeating streamed text in sdk-event-fold.
- The plan's "if upstream yields whole tool-call parts, emit one input_json_delta" is still needed
  as a FALLBACK for providers that skip the deltas, not as the primary path.

## Also known from M2's recon (not in docs/PLAN.md)

The SDK does not just POST `/v1/messages`. It probes `HEAD /` first, and posts to
`/v1/messages?beta=true`. A gateway matching the bare path only will never be hit.

## Definition of done

- All eight gates green; final slice commits through the real hook with no bypass.
- A provider of kind `openai` drives a real agent turn through the gateway, including a tool call
  the agent actually executes, verified live against a local OpenAI-compatible stub.
- Exhaustive bun fixtures on both translators and the SSE encoder.

## Steps

1. [x] Step zero: verify the installed `ai` package's fullStream part names (risk R4)  DoD: names confirmed against the .d.ts [met — see above]
2. [x] `anthropic-sse.ts` (+test)  DoD: 100% tier [met — 8 tests]
3. [x] `translate-stream.ts` (+test)  DoD: exhaustive fixtures [met — 31 tests, 100%. Uses result.stream: fullStream is DEPRECATED in v7]
4. [x] `translate-request.ts` (+test)  DoD: tool round trip, cache_control stripped [met — 45 tests, 100%]
5. [x] `gateway-server.ts`  DoD: HEAD / and POST /v1/messages?beta=true answered [met — matched on PATH, since the SDK appends ?beta=true]
6. [x] session-env openai branch  DoD: bun test green [met — 27 tests; the agent never sees the upstream key]
7. [x] Verify  DoD: driven live [met — agent -> gateway -> openai stub -> back, with a real tool execution. See below]

## Verified live (scripts/fake-openai.mjs, no key spent)

A full turn ran agent -> (Anthropic wire) -> gateway -> (OpenAI wire) -> stub -> back:
streamed text, a Bash tool the agent actually executed (`echo GATEWAY_WAS_HERE`), the
result round-tripping through the translator, and a closing line. The stub's log shows
`turn-1 (text + tool_call)` then `turn-2 (after tool result)`.

Two bugs only a live turn could find, both now covered by tests:
- The SDK sends system-role messages INSIDE `messages`; the translator rejected them
  and 400'd every real turn. ai needs `allowSystemInMessages: true` (defaults false).
- query's `model` option overrides ANTHROPIC_MODEL, so the bare model id reached the
  gateway and it could not route. Both must carry `providerId::modelId`.

## Notes / breadcrumbs

- The translators are pure and live in `src/shared/gateway/` so they carry the 100% tier and the
  mutation gate. The server is the thin shell.
- `scripts/fake-anthropic.mjs` emits exactly the wire format the gateway must produce, so it is
  the spec to compare against. M5 needs a second stub: an OpenAI-compatible endpoint for the
  gateway to CALL.
- Risk R9: loopback only, per-run random key, constant-time compare. Accepted for a local app.
- `count_tokens`: the plan says stub it (chars/4) and delete if unused. M2's recon never saw the
  SDK call it, so leave it out until something 404s. Do not build it speculatively.

## Gated on the user (unchanged)

- A live turn against the real Anthropic API, and SDK-level resume. Both need a real key.
- M4 needs `ask-marcel-office-cli@2.2.0` on npm.
- M6 targets a mac arm64 DMG, but this machine is Intel x64.
