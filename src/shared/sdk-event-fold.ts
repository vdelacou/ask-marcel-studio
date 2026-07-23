/*
 * The single source of truth mapping SDK messages to BOTH the UI event stream and
 * the parts that get persisted. One fold, two outputs, so what the user watched and
 * what lands in the conversation file cannot drift apart.
 *
 * Pure: takes `unknown` rather than the SDK's own types, so the bun runner can drive
 * it with fixtures and never imports the SDK (which would pull in electron's world).
 * Typing the input as unknown is honest anyway: these messages arrive over a pipe
 * from a subprocess, and the union has 35 variants in 0.3.185 and grows with the SDK.
 *
 * Deliberate omissions:
 * - Text comes from stream_event deltas ONLY. The assistant message repeats the whole
 *   text, so folding both would show everything twice.
 * - Messages with parent_tool_use_id set belong to a subagent. Their TOOL CALLS are
 *   folded as CHILD parts (tagged parentToolUseId) and surfaced as subagent events,
 *   so a delegated job can be watched live and reviewed after reopening. Their
 *   narration is dropped (it would interleave a second conversation into this one)
 *   and their own result message never ends the outer turn: the spawning tool's
 *   result stays the record of what the subagent concluded.
 * - Thinking blocks are dropped in v1.
 */
import type { MessagePart } from './types.ts';
import type { TurnUsage, UIEvent } from './ipc-contract.ts';

export type FoldState = {
  readonly messageId: string;
  readonly parts: readonly MessagePart[];
  readonly sdkSessionId?: string;
  readonly done: boolean;
};

export const emptyFold = (messageId: string): FoldState => ({ messageId, parts: [], done: false });

type Step = { readonly state: FoldState; readonly events: readonly UIEvent[] };

const unchanged = (state: FoldState): Step => ({ state, events: [] });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// Tool output arrives either as a plain string or as content blocks. The card shows
// text, so blocks are flattened rather than rendered structurally in v1.
const flattenToolContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => (isRecord(block) ? (asString(block['text']) ?? '') : ''))
    .filter((text) => text.length > 0)
    .join('\n');
};

const appendText = (parts: readonly MessagePart[], delta: string): readonly MessagePart[] => {
  const last = parts.at(-1);
  // Append to the trailing text part so consecutive deltas make one paragraph, not
  // one part per token.
  if (last?.type === 'text') return [...parts.slice(0, -1), { type: 'text', text: last.text + delta }];
  return [...parts, { type: 'text', text: delta }];
};

const resolveTool = (parts: readonly MessagePart[], toolUseId: string, result: string, isError: boolean): readonly MessagePart[] =>
  parts.map((part) => (part.type === 'tool' && part.toolUseId === toolUseId ? { ...part, status: isError ? 'error' : 'done', result } : part));

const foldStreamEvent = (state: FoldState, message: Record<string, unknown>, conversationId: string): Step => {
  const event = message['event'];
  if (!isRecord(event) || event['type'] !== 'content_block_delta') return unchanged(state);

  const delta = event['delta'];
  // text_delta only: thinking_delta and input_json_delta are not shown in v1.
  if (!isRecord(delta) || delta['type'] !== 'text_delta') return unchanged(state);

  const text = asString(delta['text']);
  if (text === undefined || text.length === 0) return unchanged(state);

  return {
    state: { ...state, parts: appendText(state.parts, text) },
    events: [{ type: 'text-delta', conversationId, messageId: state.messageId, delta: text }],
  };
};

const foldAssistant = (state: FoldState, message: Record<string, unknown>, conversationId: string): Step => {
  const inner = message['message'];
  if (!isRecord(inner) || !Array.isArray(inner['content'])) return unchanged(state);

  let next = state;
  const events: UIEvent[] = [];
  for (const block of inner['content']) {
    // tool_use only: text is already streamed, thinking is dropped.
    if (!isRecord(block) || block['type'] !== 'tool_use') continue;
    const toolUseId = asString(block['id']);
    const name = asString(block['name']);
    if (toolUseId === undefined || name === undefined) continue;

    const input = block['input'];
    next = { ...next, parts: [...next.parts, { type: 'tool', toolUseId, name, input, status: 'running' }] };
    events.push({ type: 'tool-start', conversationId, messageId: state.messageId, toolUseId, name, input });
  }
  return { state: next, events };
};

const foldUser = (state: FoldState, message: Record<string, unknown>, conversationId: string): Step => {
  const inner = message['message'];
  if (!isRecord(inner) || !Array.isArray(inner['content'])) return unchanged(state);

  let next = state;
  const events: UIEvent[] = [];
  for (const block of inner['content']) {
    if (!isRecord(block) || block['type'] !== 'tool_result') continue;
    const toolUseId = asString(block['tool_use_id']);
    if (toolUseId === undefined) continue;
    // A result for a tool we never saw start: ignore rather than invent a card.
    if (!next.parts.some((p) => p.type === 'tool' && p.toolUseId === toolUseId)) continue;

    const result = flattenToolContent(block['content']);
    const isError = block['is_error'] === true;
    next = { ...next, parts: resolveTool(next.parts, toolUseId, result, isError) };
    events.push({ type: 'tool-result', conversationId, messageId: state.messageId, toolUseId, result, isError });
  }
  return { state: next, events };
};

// A subagent's own tool calls: folded as child parts under the spawning tool call,
// with the same event mirror as the main loop, so live view and file agree.
const foldSubagentStarts = (state: FoldState, blocks: readonly Record<string, unknown>[], conversationId: string, parentToolUseId: string): Step => {
  let next = state;
  const events: UIEvent[] = [];
  for (const block of blocks) {
    if (block['type'] !== 'tool_use') continue;
    const toolUseId = asString(block['id']);
    const name = asString(block['name']);
    if (toolUseId === undefined || name === undefined) continue;
    next = { ...next, parts: [...next.parts, { type: 'tool', toolUseId, name, input: block['input'], status: 'running', parentToolUseId }] };
    events.push({ type: 'subagent-tool-start', conversationId, messageId: state.messageId, parentToolUseId, toolUseId, name, input: block['input'] });
  }
  return { state: next, events };
};

const foldSubagentResults = (state: FoldState, blocks: readonly Record<string, unknown>[], conversationId: string, parentToolUseId: string): Step => {
  let next = state;
  const events: UIEvent[] = [];
  for (const block of blocks) {
    if (block['type'] !== 'tool_result') continue;
    const toolUseId = asString(block['tool_use_id']);
    if (toolUseId === undefined) continue;
    // A result for a step we never saw start: ignore rather than invent a card.
    if (!next.parts.some((p) => p.type === 'tool' && p.toolUseId === toolUseId)) continue;

    const result = flattenToolContent(block['content']);
    const isError = block['is_error'] === true;
    next = { ...next, parts: resolveTool(next.parts, toolUseId, result, isError) };
    events.push({ type: 'subagent-tool-result', conversationId, messageId: state.messageId, parentToolUseId, toolUseId, result, isError });
  }
  return { state: next, events };
};

const foldSubagent = (state: FoldState, message: Record<string, unknown>, conversationId: string, parentToolUseId: string): Step => {
  const inner = message['message'];
  if (!isRecord(inner) || !Array.isArray(inner['content'])) return unchanged(state);
  const blocks = inner['content'].filter(isRecord);

  if (message['type'] === 'assistant') return foldSubagentStarts(state, blocks, conversationId, parentToolUseId);
  if (message['type'] === 'user') return foldSubagentResults(state, blocks, conversationId, parentToolUseId);
  // Its narration, its own result message, its system init: a second conversation we
  // do not render.
  return unchanged(state);
};

const readUsage = (message: Record<string, unknown>): TurnUsage => {
  const usage = message['usage'];
  const cost = message['total_cost_usd'];
  const read = (key: string): number => {
    const value = isRecord(usage) ? usage[key] : undefined;
    return typeof value === 'number' ? value : 0;
  };
  return { inputTokens: read('input_tokens'), outputTokens: read('output_tokens'), ...(typeof cost === 'number' ? { costUsd: cost } : {}) };
};

const foldResult = (state: FoldState, message: Record<string, unknown>, conversationId: string): Step => {
  const sessionId = asString(message['session_id']);
  const next: FoldState = { ...state, done: true, ...(sessionId === undefined ? {} : { sdkSessionId: sessionId }) };

  // SDKResultMessage is a union of success and error; a failed turn must not report
  // a clean finish.
  if (message['is_error'] === true || message['subtype'] !== 'success') {
    const detail = asString(message['result']) ?? asString(message['subtype']) ?? 'the turn failed';
    return { state: next, events: [{ type: 'error', conversationId, message: detail }] };
  }
  return { state: next, events: [{ type: 'turn-done', conversationId, usage: readUsage(message) }] };
};

export const foldSdkMessage = (state: FoldState, message: unknown, conversationId: string): Step => {
  if (!isRecord(message)) return unchanged(state);

  // Anything from a subagent belongs to a nested conversation. Its tool calls are
  // surfaced under the tool that spawned it; everything else it says is dropped.
  const parentToolUseId = asString(message['parent_tool_use_id']);
  if (parentToolUseId !== undefined) return foldSubagent(state, message, conversationId, parentToolUseId);

  switch (message['type']) {
    case 'stream_event':
      return foldStreamEvent(state, message, conversationId);
    case 'assistant':
      return foldAssistant(state, message, conversationId);
    case 'user':
      return foldUser(state, message, conversationId);
    case 'result':
      return foldResult(state, message, conversationId);
    case 'system': {
      // Captured as early as possible: a crash mid-turn can still resume from it.
      const sessionId = asString(message['session_id']);
      return unchanged(sessionId === undefined ? state : { ...state, sdkSessionId: sessionId });
    }
    default:
      // 35 variants and growing. Unknown is normal, not exceptional.
      return unchanged(state);
  }
};
