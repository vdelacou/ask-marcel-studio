/*
 * Anthropic SSE events, and how they go on the wire.
 *
 * The SDK's HTTP client parses `event: <name>` + `data: <json>` pairs separated by a
 * blank line. Getting the framing wrong fails silently: the client sees no events and
 * the turn just hangs, so this is worth its own module and its own test.
 *
 * Pure: zero electron, zero node:http. `bun test` covers it.
 */

export type AnthropicSseEvent =
  | {
      readonly type: 'message_start';
      readonly message: { readonly id: string; readonly model: string; readonly usage: { readonly input_tokens: number; readonly output_tokens: number } };
    }
  | { readonly type: 'content_block_start'; readonly index: number; readonly content_block: TextBlock | ToolUseBlock }
  | { readonly type: 'content_block_delta'; readonly index: number; readonly delta: TextDelta | InputJsonDelta }
  | { readonly type: 'content_block_stop'; readonly index: number }
  | { readonly type: 'message_delta'; readonly delta: { readonly stop_reason: StopReason }; readonly usage: { readonly output_tokens: number } }
  | { readonly type: 'message_stop' }
  | { readonly type: 'error'; readonly error: { readonly type: string; readonly message: string } };

export type TextBlock = { readonly type: 'text'; readonly text: string };
export type ToolUseBlock = { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: Record<string, never> };
export type TextDelta = { readonly type: 'text_delta'; readonly text: string };
export type InputJsonDelta = { readonly type: 'input_json_delta'; readonly partial_json: string };

export type StopReason = 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence';

// `event:` names the type, `data:` carries the same type inside the payload, and the
// blank line terminates the frame. All three matter.
export const encodeSse = (event: AnthropicSseEvent): string => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
