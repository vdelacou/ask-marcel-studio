/*
 * Turning text into a vector, through an OpenAI-compatible embeddings endpoint.
 *
 * The pure half of the embedder (rule 32, the model behind a port): building the request
 * and reading the response. The fetch itself is the adapter's, so this is testable without
 * a network and the response parser is the checkpoint for what the provider returns.
 *
 * The endpoint is the OpenAI `/v1/embeddings` shape, which every OpenAI-compatible provider
 * (the LVMH gateway, Google via its compat layer, a local Ollama) speaks.
 */
export type EmbeddingRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
};

// baseUrl may or may not carry a trailing /v1, exactly like the chat one; normalise so the
// path is appended once.
const embeddingsUrl = (baseUrl: string): string => {
  let url = baseUrl;
  while (url.endsWith('/')) url = url.slice(0, -1);
  const withV1 = url.endsWith('/v1') ? url : `${url}/v1`;
  return `${withV1}/embeddings`;
};

export const buildEmbeddingRequest = (input: { readonly baseUrl: string; readonly apiKey: string; readonly model: string; readonly text: string }): EmbeddingRequest => ({
  url: embeddingsUrl(input.baseUrl),
  headers: { 'content-type': 'application/json', authorization: `Bearer ${input.apiKey}` },
  body: JSON.stringify({ model: input.model, input: input.text }),
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

// The response is `{ data: [{ embedding: number[] }] }`. Untrusted like any provider
// output: a missing or malformed embedding is an error, not a silent empty vector, because
// an empty vector would score zero against everything and quietly break search.
export const parseEmbeddingResponse = (raw: unknown): readonly number[] | undefined => {
  if (!isRecord(raw) || !Array.isArray(raw['data'])) return undefined;
  const first = raw['data'][0];
  if (!isRecord(first) || !Array.isArray(first['embedding'])) return undefined;
  const vector = first['embedding'].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return vector.length === 0 ? undefined : vector;
};
