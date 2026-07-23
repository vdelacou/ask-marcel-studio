/*
 * Gemini 3 refuses a turn that replays a function call without the thought signature it
 * minted with that call: 400 INVALID_ARGUMENT, "Function call is missing a thought_signature
 * in functionCall parts ... position 5". Seen live on gemini-3.5-flash-lite through the
 * OpenAI-compatible endpoint, with every tool the agent carries.
 *
 * The signature cannot survive this repo's own Anthropic round trip. The provider hands it
 * over on the `tool-call` stream part, an Anthropic `tool_use` block has nowhere to put it,
 * and the agent replays id, name and input alone. So the gateway remembers it by tool call
 * id on the way in and puts it back on the way out. Nothing else can: the value is opaque
 * and only the process that received it holds it.
 *
 * Where nothing was remembered, Google's own documented dummy waves the step through
 * (https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures, FAQs). That
 * happens when the app restarted and the agent resumed a conversation off disk, or when the
 * entry aged out. It costs model quality, which is why it is spent only on a step this
 * process knows nothing about, and only inside the turn Google actually validates. A step
 * that IS remembered goes back out exactly as it arrived, including the calls of a parallel
 * batch that Gemini deliberately left unsigned.
 *
 * None of it happens off Google. Every provider of kind `openai` comes through this gateway,
 * a local llama server, DeepSeek, OpenRouter, and `extra_content.google.thought_signature` is
 * a field only Google asked for: the package writes it out whenever the value is present,
 * with no idea where the request is going. So the upstream host decides, and everything else
 * sees exactly the request it saw before this module existed.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import type { AssistantPart, ModelMessage } from './translate-request.ts';

export type ThoughtSignatures = ReadonlyMap<string, string>;

export const noSignatures: ThoughtSignatures = new Map();

// One of the two literals Google sanctions for a trace that carries no signatures. Sent as
// written: the four shipping clients that talk to the compatibility endpoint send this
// ASCII form, and an invented placeholder is refused as a corrupted signature rather than
// ignored.
export const DUMMY_SIGNATURE = 'skip_thought_signature_validator';

// A tool loop long enough to overflow this has long since left the model's context. Bounded
// because the book lives as long as the app does; the cost of a miss is the dummy above, not
// a failure.
const LIMIT = 512;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// The provider files the signature under its own name, and that name is the user's provider
// id, which a pure module has no way to know. No other provider metadata field is called
// thoughtSignature, so it is found by name rather than by address.
const signatureIn = (metadata: unknown): string | undefined => {
  if (!isRecord(metadata)) return undefined;
  for (const namespace of Object.values(metadata)) {
    const found = isRecord(namespace) ? namespace['thoughtSignature'] : undefined;
    if (typeof found === 'string' && found.length > 0) return found;
  }
  return undefined;
};

export const rememberSignature = (book: ThoughtSignatures, part: unknown): ThoughtSignatures => {
  if (!isRecord(part) || part['type'] !== 'tool-call') return book;
  const id = part['toolCallId'];
  const signature = signatureIn(part['providerMetadata']);
  if (typeof id !== 'string' || signature === undefined) return book;
  const entries: readonly (readonly [string, string])[] = [...book, [id, signature]];
  return new Map(entries.slice(-LIMIT));
};

const isToolCall = (part: AssistantPart): part is Extract<AssistantPart, { readonly type: 'tool-call' }> => part.type === 'tool-call';

const signPart = (part: AssistantPart, book: ThoughtSignatures, whenUnknown: string | undefined): AssistantPart => {
  if (!isToolCall(part)) return part;
  const signature = book.get(part.toolCallId) ?? whenUnknown;
  return signature === undefined ? part : { ...part, providerOptions: { google: { thoughtSignature: signature } } };
};

// Gemini validates the first call of each step in the current turn, so a step whose first
// call is unremembered is the one that would fail, and the whole step is dummied together
// rather than mixing a real signature with a placeholder.
const signMessage = (message: ModelMessage, book: ThoughtSignatures, inCurrentTurn: boolean): ModelMessage => {
  if (message.role !== 'assistant') return message;
  const first = message.content.find(isToolCall);
  if (first === undefined) return message;
  const unknown = inCurrentTurn && !book.has(first.toolCallId);
  return { role: 'assistant', content: message.content.map((part) => signPart(part, book, unknown ? DUMMY_SIGNATURE : undefined)) };
};

// Gemini answers on generativelanguage.googleapis.com and Vertex on <region>-aiplatform, so
// the family is what is tested rather than one host. A base url the user typed wrong parses
// to nothing and signs nothing, which is the same answer as any other non-Google endpoint.
const mintsSignatures = (baseUrl: string): boolean => {
  if (!URL.canParse(baseUrl)) return false;
  return new URL(baseUrl).hostname.endsWith('.googleapis.com');
};

export const signAssistantTurns = (messages: readonly ModelMessage[], book: ThoughtSignatures, baseUrl: string): readonly ModelMessage[] => {
  if (!mintsSignatures(baseUrl)) return messages;
  // The current turn opens at the last user message: a tool result is its own role here, so
  // it cannot be mistaken for one.
  const turnOpens = messages.reduce((at, message, index) => (message.role === 'user' ? index + 1 : at), 0);
  return messages.map((message, index) => signMessage(message, book, index >= turnOpens));
};
