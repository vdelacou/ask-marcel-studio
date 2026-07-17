/*
 * ai v7's fullStream -> Anthropic's SSE events. The gateway's hardest surface, so it
 * is a pure reducer with fixtures rather than logic buried in a request handler.
 *
 * Takes `unknown` rather than ai's TextStreamPart: these parts arrive over a network
 * boundary from a provider we do not control, the union has 26 members in v7, and it
 * grows. Unknown is the honest type, and it keeps this module free of an ai import.
 *
 * Two things the part names cost to learn (verified against the installed .d.ts):
 * - `text-delta` carries `text`. v4 called the field `textDelta`; docs/PLAN.md assumed v4/v5.
 * - `tool-call` is emitted IN ADDITION to tool-input-start/delta/end. Relaying both
 *   would hand the agent the same tool twice.
 */
import type { AnthropicSseEvent, StopReason } from './anthropic-sse.ts';

export type StreamState = {
  readonly messageId: string;
  readonly model: string;
  // The Anthropic block index. Blocks are numbered in the order they open; two blocks
  // sharing an index would overwrite each other on the client.
  readonly nextIndex: number;
  // The block currently open, if any. Anthropic allows one at a time.
  readonly open?: { readonly index: number; readonly kind: 'text' | 'tool'; readonly id: string };
  // Tool ids already relayed via their input deltas, so the trailing `tool-call` for
  // the same id can be dropped instead of duplicating the block.
  readonly relayedTools: readonly string[];
  readonly done: boolean;
};

export const emptyStream = (messageId: string, model: string): StreamState => ({ messageId, model, nextIndex: 0, relayedTools: [], done: false });

type Step = { readonly state: StreamState; readonly events: readonly AnthropicSseEvent[] };

const nothing = (state: StreamState): Step => ({ state, events: [] });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// Everything else, including anything a future ai release invents, ends the turn
// cleanly rather than inventing a reason.
const STOP_REASONS: Readonly<Record<string, StopReason>> = { stop: 'end_turn', length: 'max_tokens', 'tool-calls': 'tool_use' };
const toStopReason = (finishReason: unknown): StopReason => {
  const key = asString(finishReason);
  if (key === 'stop') return STOP_REASONS.stop as StopReason;
  if (key === 'length') return STOP_REASONS.length as StopReason;
  if (key === 'tool-calls') return STOP_REASONS['tool-calls'] as StopReason;
  return 'end_turn';
};

const closeOpen = (state: StreamState): Step => {
  if (state.open === undefined) return nothing(state);
  return { state: { ...state, open: undefined }, events: [{ type: 'content_block_stop', index: state.open.index }] };
};

const openText = (state: StreamState, id: string): Step => {
  const closed = closeOpen(state);
  const index = closed.state.nextIndex;
  return {
    state: { ...closed.state, nextIndex: index + 1, open: { index, kind: 'text', id } },
    events: [...closed.events, { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }],
  };
};

const openTool = (state: StreamState, id: string, name: string): Step => {
  const closed = closeOpen(state);
  const index = closed.state.nextIndex;
  return {
    state: { ...closed.state, nextIndex: index + 1, open: { index, kind: 'tool', id }, relayedTools: [...closed.state.relayedTools, id] },
    // input starts empty: the arguments arrive as input_json_delta.
    events: [...closed.events, { type: 'content_block_start', index, content_block: { type: 'tool_use', id, name, input: {} } }],
  };
};

const textDelta = (state: StreamState, part: Record<string, unknown>): Step => {
  const text = asString(part['text']);
  if (text === undefined || text.length === 0) return nothing(state);

  // Some providers stream deltas without a text-start; open the block rather than
  // dropping the answer on the floor.
  const opened = state.open?.kind === 'text' ? nothing(state) : openText(state, asString(part['id']) ?? 'text');
  const index = opened.state.open?.index ?? 0;
  return { state: opened.state, events: [...opened.events, { type: 'content_block_delta', index, delta: { type: 'text_delta', text } }] };
};

const toolInputDelta = (state: StreamState, part: Record<string, unknown>): Step => {
  const delta = asString(part['delta']);
  if (delta === undefined || delta.length === 0 || state.open?.kind !== 'tool') return nothing(state);
  return { state, events: [{ type: 'content_block_delta', index: state.open.index, delta: { type: 'input_json_delta', partial_json: delta } }] };
};

// The fallback for providers that never stream arguments: one delta carrying the whole
// JSON is legal. Skipped when the deltas already relayed this id.
const wholeToolCall = (state: StreamState, part: Record<string, unknown>): Step => {
  const id = asString(part['toolCallId']);
  const name = asString(part['toolName']);
  if (id === undefined || name === undefined || state.relayedTools.includes(id)) return nothing(state);

  const opened = openTool(state, id, name);
  const index = opened.state.open?.index ?? 0;
  const closed = closeOpen(opened.state);
  return {
    state: closed.state,
    events: [...opened.events, { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(part['input'] ?? {}) } }, ...closed.events],
  };
};

const finish = (state: StreamState, part: Record<string, unknown>): Step => {
  // Close whatever is still open first: a block left open hangs the client.
  const closed = closeOpen(state);
  const usage = part['totalUsage'];
  const outputTokens = isRecord(usage) && typeof usage['outputTokens'] === 'number' ? usage['outputTokens'] : 0;
  return {
    state: { ...closed.state, done: true },
    events: [
      ...closed.events,
      { type: 'message_delta', delta: { stop_reason: toStopReason(part['finishReason']) }, usage: { output_tokens: outputTokens } },
      { type: 'message_stop' },
    ],
  };
};

const errorEvent = (state: StreamState, part: Record<string, unknown>): Step => {
  const raw = part['error'];
  const message = asString(raw) ?? (isRecord(raw) ? (asString(raw['message']) ?? 'upstream error') : 'upstream error');
  return { state: { ...state, done: true }, events: [{ type: 'error', error: { type: 'api_error', message } }] };
};

export const translatePart = (state: StreamState, part: unknown): Step => {
  if (!isRecord(part)) return nothing(state);

  switch (part['type']) {
    case 'text-start':
      return openText(state, asString(part['id']) ?? 'text');
    case 'text-delta':
      return textDelta(state, part);
    case 'text-end':
      return closeOpen(state);
    case 'tool-input-start':
      return openTool(state, asString(part['id']) ?? '', asString(part['toolName']) ?? '');
    case 'tool-input-delta':
      return toolInputDelta(state, part);
    case 'tool-input-end':
      return closeOpen(state);
    case 'tool-call':
      return wholeToolCall(state, part);
    case 'finish':
      return finish(state, part);
    case 'error':
      return errorEvent(state, part);
    case 'abort':
      // Ends the stream without claiming the turn completed.
      return nothing({ ...state, done: true });
    default:
      // start, start-step, finish-step, reasoning-*, tool-result, raw, and whatever
      // v8 adds. Unknown is normal here, not exceptional.
      return nothing(state);
  }
};
