/*
 * A tool schema trimmed to the fields Google's Schema proto accepts.
 *
 * The gateway forwards the agent's `input_schema` to whatever OpenAI-compatible endpoint the
 * user configured. OpenAI ignores JSON Schema keywords it does not know; Gemini refuses them,
 * with a protobuf-style "Unknown name X at tools[17]" that fails the WHOLE request before a
 * single token is generated. Since every turn in this app ships tools, an unsanitised schema
 * means Gemini never answers at all.
 *
 * Written against the 29 tool schemas the agent really sends, captured from live traffic
 * rather than guessed: they carry `$schema`, `additionalProperties`, `propertyNames`,
 * `exclusiveMinimum` and `format: 'uri'`, all refused, plus `const`, which Gemini has no field
 * for but which a one-choice `enum` expresses exactly. They carry no `$ref`, `$defs`, `oneOf`
 * or `allOf`, so nothing here resolves references.
 *
 * An allow-list, not a deny-list, because the agent SDK owns these schemas and updates them:
 * an unrecognised keyword must fall out silently, never reach Gemini and 400 the turn. This
 * runs for every openai-kind provider, not just Gemini. The fields it removes are advisory to
 * a model choosing tool arguments, and the agent validates what comes back regardless, so the
 * cost elsewhere is nil and the gateway sends one schema every endpoint accepts.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Every scalar field of Google's Schema proto. `properties`, `items`, `anyOf`, `const` and
// `format` are handled separately below, because each needs more than copying.
const KEEP: ReadonlySet<string> = new Set([
  'type',
  'title',
  'description',
  'nullable',
  'enum',
  'required',
  'default',
  'example',
  'pattern',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
  'propertyOrdering',
]);

// The only values its `format` understands. Anything else, `'uri'` included, is refused as
// firmly as an unknown field.
const FORMATS: ReadonlySet<string> = new Set(['enum', 'date-time', 'float', 'double', 'int32', 'int64']);

// Keys here are property NAMES chosen by whoever wrote the tool, never schema keywords, so
// they are carried through untouched and only their values are cleaned.
const cleanProperties = (raw: unknown): Record<string, unknown> => {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).map(([name, sub]) => [name, sanitiseToolSchema(sub)]));
};

const entriesFor = (key: string, value: unknown): readonly [string, unknown][] => {
  if (key === 'properties') return [['properties', cleanProperties(value)]];
  if (key === 'items') return [['items', sanitiseToolSchema(value)]];
  if (key === 'anyOf') return [['anyOf', (Array.isArray(value) ? value : []).map((member) => sanitiseToolSchema(member))]];
  if (key === 'const') return [['enum', [value]]];
  if (key === 'format') return FORMATS.has(String(value)) ? [[key, value]] : [];
  return KEEP.has(key) ? [[key, value]] : [];
};

export const sanitiseToolSchema = (schema: unknown): Record<string, unknown> => {
  if (!isRecord(schema)) return {};
  return Object.fromEntries(Object.entries(schema).flatMap(([key, value]) => entriesFor(key, value)));
};
