/*
 * The shape of a log line, and when the file has grown enough to rotate.
 *
 * The app had no logging at all: a turn that failed left nothing behind. This is the pure
 * half of a small file logger, kept deliberately tiny (no dependency, atelier lazy ladder).
 *
 * The redaction rule is the reason this exists as its own module: a log must never carry a
 * mail body, a prompt, a command string, or a title (rule 27). Callers log event names,
 * ids, error kinds, counts and durations; every string field is clamped here as a backstop
 * so a mistake truncates rather than leaks.
 */
export type LogLevel = 'info' | 'warn' | 'error';

export type LogValue = string | number | boolean;
export type LogFields = Readonly<Record<string, LogValue>>;

// The port every service depends on, so no one reaches for console.* (rule 4).
export type Logger = {
  readonly info: (event: string, fields?: LogFields) => void;
  readonly warn: (event: string, fields?: LogFields) => void;
  readonly error: (event: string, fields?: LogFields) => void;
};

// Long enough for an id or an error kind, short enough that a mail body or a prompt cannot
// ride in on a mislabelled field.
const MAX_FIELD = 200;

const clampValue = (value: LogValue): LogValue => (typeof value === 'string' && value.length > MAX_FIELD ? `${value.slice(0, MAX_FIELD)}…` : value);

const clampFields = (fields: LogFields): Record<string, LogValue> => {
  const clamped: Record<string, LogValue> = {};
  for (const [key, value] of Object.entries(fields)) clamped[key] = clampValue(value);
  return clamped;
};

// One NDJSON line: a time, a level, an event, and the clamped fields flattened in.
export const formatLogLine = (input: { readonly at: string; readonly level: LogLevel; readonly event: string; readonly fields?: LogFields }): string =>
  `${JSON.stringify({ at: input.at, level: input.level, event: input.event, ...(input.fields === undefined ? {} : clampFields(input.fields)) })}\n`;

// True once the file has reached the cap and should be rolled to .1.
export const shouldRotate = (currentBytes: number, maxBytes: number): boolean => currentBytes >= maxBytes;
