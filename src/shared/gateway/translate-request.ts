/*
 * An Anthropic /v1/messages request -> the params streamText wants.
 *
 * Pure, so the mapping is testable without a network call or an ai import. The server
 * turns the result into the actual call.
 *
 * The interesting cases are the round trip: the agent sends its own tool_use blocks
 * back as conversation history, and tool_result blocks as the outputs it produced.
 * Both have to become the shapes the AI SDK expects, or the model loses the thread of
 * what it already did.
 */
import type { Result } from '../result.ts';
import { err, ok } from '../result.ts';

export type GatewayRequestError = { readonly kind: 'bad-request'; readonly message: string };

export type ModelMessage =
  | { readonly role: 'system'; readonly content: string }
  | { readonly role: 'user'; readonly content: readonly UserPart[] }
  | { readonly role: 'assistant'; readonly content: readonly AssistantPart[] }
  | { readonly role: 'tool'; readonly content: readonly ToolResultPart[] };

export type UserPart = { readonly type: 'text'; readonly text: string };
export type AssistantPart =
  { readonly type: 'text'; readonly text: string } | { readonly type: 'tool-call'; readonly toolCallId: string; readonly toolName: string; readonly input: unknown };
export type ToolResultPart = {
  readonly type: 'tool-result';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly output: { readonly type: 'text'; readonly value: string };
};

export type ToolSpec = { readonly name: string; readonly description: string; readonly inputSchema: unknown };

export type TranslatedRequest = {
  readonly modelRef: string;
  readonly system?: string;
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ToolSpec[];
  readonly toolChoice?: 'auto' | 'required' | { readonly type: 'tool'; readonly toolName: string };
  readonly maxOutputTokens?: number;
  readonly stream: boolean;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const badRequest = (message: string): Result<never, GatewayRequestError> => err({ kind: 'bad-request', message });

// Anthropic's `system` is either a string or an array of text blocks carrying
// cache_control, which means nothing to an OpenAI-compatible endpoint.
const readSystem = (raw: unknown): string | undefined => {
  const text = asString(raw);
  if (text !== undefined) return text.length === 0 ? undefined : text;
  if (!Array.isArray(raw)) return undefined;
  const joined = raw
    .map((block) => (isRecord(block) ? (asString(block['text']) ?? '') : ''))
    .filter((t) => t.length > 0)
    .join('\n\n');
  return joined.length === 0 ? undefined : joined;
};

// Tool output is a string or a list of blocks. The model reads text either way.
const flattenToolResult = (content: unknown): string => {
  const text = asString(content);
  if (text !== undefined) return text;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => (isRecord(block) ? (asString(block['text']) ?? '') : ''))
    .filter((t) => t.length > 0)
    .join('\n');
};

const readToolChoice = (raw: unknown): TranslatedRequest['toolChoice'] => {
  if (!isRecord(raw)) return undefined;
  if (raw['type'] === 'any') return 'required';
  if (raw['type'] === 'auto') return 'auto';
  if (raw['type'] === 'tool') {
    const name = asString(raw['name']);
    return name === undefined ? 'auto' : { type: 'tool', toolName: name };
  }
  return undefined;
};

// A user-role message may carry tool_result blocks, which the AI SDK models as a
// separate tool-role message. One inbound message can therefore split into two.
const translateUser = (blocks: readonly unknown[], toolNames: ReadonlyMap<string, string>): ModelMessage[] => {
  const text: UserPart[] = [];
  const results: ToolResultPart[] = [];
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    if (block['type'] === 'text') {
      const value = asString(block['text']);
      if (value !== undefined && value.length > 0) text.push({ type: 'text', text: value });
    }
    if (block['type'] === 'tool_result') {
      const id = asString(block['tool_use_id']);
      if (id === undefined) continue;
      results.push({ type: 'tool-result', toolCallId: id, toolName: toolNames.get(id) ?? 'unknown', output: { type: 'text', value: flattenToolResult(block['content']) } });
    }
  }
  // Tool results first: they answer the assistant turn that precedes them.
  const messages: ModelMessage[] = [];
  if (results.length > 0) messages.push({ role: 'tool', content: results });
  if (text.length > 0) messages.push({ role: 'user', content: text });
  return messages;
};

const translateAssistant = (blocks: readonly unknown[], toolNames: Map<string, string>): ModelMessage[] => {
  const parts: AssistantPart[] = [];
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    if (block['type'] === 'text') {
      const value = asString(block['text']);
      if (value !== undefined && value.length > 0) parts.push({ type: 'text', text: value });
    }
    if (block['type'] === 'tool_use') {
      const id = asString(block['id']);
      const name = asString(block['name']);
      if (id === undefined || name === undefined) continue;
      // Remembered so a later tool_result can name its tool: Anthropic's result block
      // carries only the id, while the AI SDK wants the name too.
      toolNames.set(id, name);
      parts.push({ type: 'tool-call', toolCallId: id, toolName: name, input: block['input'] ?? {} });
    }
    // thinking, redacted_thinking, image, and anything else are dropped: an
    // OpenAI-compatible endpoint has nowhere to put them.
  }
  return parts.length === 0 ? [] : [{ role: 'assistant', content: parts }];
};

export const translateRequest = (raw: unknown): Result<TranslatedRequest, GatewayRequestError> => {
  if (!isRecord(raw)) return badRequest('the request body must be an object');

  const modelRef = asString(raw['model']);
  if (modelRef === undefined || modelRef.length === 0) return badRequest('the request needs a model');
  if (!Array.isArray(raw['messages'])) return badRequest('the request needs a messages array');

  // Built as the assistant turns are read, so a tool_result can be given its name.
  const toolNames = new Map<string, string>();
  const messages: ModelMessage[] = [];
  for (const message of raw['messages']) {
    if (!isRecord(message)) return badRequest('every message must be an object');
    const role = message['role'];
    const content = message['content'];
    // A plain string content is legal on the Anthropic wire.
    const blocks = Array.isArray(content) ? content : [{ type: 'text', text: asString(content) ?? '' }];

    if (role === 'user') messages.push(...translateUser(blocks, toolNames));
    else if (role === 'assistant') messages.push(...translateAssistant(blocks, toolNames));
    // The SDK really does put system-role messages in the array, alongside the
    // top-level `system` field. Caught live: refusing them 400s every real turn.
    else if (role === 'system') {
      const text = blocks
        .map((block) => (isRecord(block) ? (asString(block['text']) ?? '') : ''))
        .filter((x) => x.length > 0)
        .join('\n\n');
      if (text.length > 0) messages.push({ role: 'system', content: text });
    } else return badRequest(`unknown message role: ${String(role)}`);
  }

  const tools: ToolSpec[] = [];
  if (Array.isArray(raw['tools'])) {
    for (const tool of raw['tools']) {
      if (!isRecord(tool)) continue;
      const name = asString(tool['name']);
      if (name === undefined) continue;
      tools.push({ name, description: asString(tool['description']) ?? '', inputSchema: tool['input_schema'] ?? { type: 'object' } });
    }
  }

  const maxTokens = raw['max_tokens'];
  const system = readSystem(raw['system']);
  const toolChoice = readToolChoice(raw['tool_choice']);
  return ok({
    modelRef,
    ...(system === undefined ? {} : { system }),
    messages,
    tools,
    ...(toolChoice === undefined ? {} : { toolChoice }),
    ...(typeof maxTokens === 'number' ? { maxOutputTokens: maxTokens } : {}),
    stream: raw['stream'] === true,
  });
};
