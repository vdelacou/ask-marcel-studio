/*
 * Picking a message out of the sent folder.
 *
 * The office CLI answers in a `{ ok, data: { value: [...] } }` envelope. This reads one
 * id out of it, which is all the signature fetch needs as a fallback when the CLI
 * cannot find a signature on its own.
 *
 * Process output is untrusted input, so nothing here assumes a field is present or well
 * typed.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const pickSentMessageId = (stdout: string): string | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }

  const data = isRecord(parsed) ? parsed['data'] : undefined;
  const value = isRecord(data) ? data['value'] : undefined;
  if (!Array.isArray(value)) return undefined;

  for (const entry of value) {
    const id = isRecord(entry) ? entry['id'] : undefined;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return undefined;
};
