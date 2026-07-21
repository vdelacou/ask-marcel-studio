/*
 * Turning a conversation into something a model can read, and reading its answer back.
 *
 * The transcript is rendered rather than handed over whole: tool calls collapse to one
 * line each, because what matters is what was said, not how it was found. The answer is
 * parsed strictly: this decides what the app will remember about the user's colleagues,
 * so a malformed item is dropped rather than guessed at.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import { memoryFileName } from './memory-file-name.ts';
import type { MemoryFileName } from './memory-file-name.ts';
import type { Message } from './types.ts';
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

const TRANSCRIPT_CAP_BYTES = 30_000;

const renderMessage = (message: Message): string => {
  const who = message.role === 'user' ? 'User' : 'Assistant';
  const body = message.parts.map((part) => (part.type === 'text' ? part.text : `[used ${part.name}]`)).join('\n');
  return `${who}: ${body}`;
};

// Oldest first is what gets dropped: the recent end of a conversation is where the
// words worth remembering are.
export const renderTranscriptForExtraction = (messages: readonly Message[], fromIndex: number, capBytes = TRANSCRIPT_CAP_BYTES): string => {
  const rendered = messages.slice(Math.max(0, fromIndex)).map(renderMessage);
  const kept: string[] = [];
  let size = 0;
  for (const line of [...rendered].reverse()) {
    size += line.length + 1;
    if (size > capBytes) return `(earlier messages omitted)\n${kept.join('\n')}`;
    kept.unshift(line);
  }
  return kept.join('\n');
};

export type RawCandidate = {
  readonly kind: MemoryFileName;
  readonly term: string;
  readonly detail: string;
  readonly alternatives: readonly string[];
  readonly quote: string;
  readonly enrichment?: string;
};

// Clipped so one long answer cannot fill the notes, which are read into every turn.
const TERM_LIMIT = 80;
const DETAIL_LIMIT = 300;
const QUOTE_LIMIT = 200;
const ALTERNATIVES_LIMIT = 3;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const clipped = (value: unknown, limit: number): string => (typeof value === 'string' ? value.trim().slice(0, limit) : '');

const parseCandidate = (raw: unknown): RawCandidate | undefined => {
  if (!isRecord(raw)) return undefined;
  const kind = memoryFileName(raw['kind']);
  const term = clipped(raw['term'], TERM_LIMIT);
  const detail = clipped(raw['detail'], DETAIL_LIMIT);
  // A term with no meaning attached is not worth asking about.
  if (!kind.ok || term.length === 0 || detail.length === 0) return undefined;

  const enrichment = typeof raw['enrichment'] === 'string' && raw['enrichment'].trim().length > 0 ? clipped(raw['enrichment'], DETAIL_LIMIT) : undefined;
  return {
    kind: kind.value,
    term,
    detail,
    alternatives: (Array.isArray(raw['alternatives']) ? raw['alternatives'] : [])
      .map((entry) => clipped(entry, DETAIL_LIMIT))
      .filter((entry) => entry.length > 0)
      .slice(0, ALTERNATIVES_LIMIT),
    quote: clipped(raw['quote'], QUOTE_LIMIT),
    ...(enrichment === undefined ? {} : { enrichment }),
  };
};

// The last fenced JSON block, or the whole answer if it is JSON. Last, because a model
// that thinks out loud puts the answer at the end.
const jsonOf = (modelOutput: string): unknown => {
  const fences = [...modelOutput.matchAll(/```(?:json)?\n([^`]*)\n```/g)];
  const candidate = fences.at(-1)?.[1] ?? modelOutput;
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
};

export const parseMemoryCandidates = (modelOutput: string): Result<readonly RawCandidate[], string> => {
  const parsed = jsonOf(modelOutput);
  if (!isRecord(parsed) || !Array.isArray(parsed['candidates'])) return err('the answer was not the expected list of candidates');
  return ok(parsed['candidates'].flatMap((entry) => parseCandidate(entry) ?? []));
};
