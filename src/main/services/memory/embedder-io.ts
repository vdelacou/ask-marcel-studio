/*
 * The embedding fetch: the one outbound call the memory store makes.
 *
 * Thin IO shell around shared/embedding. The request and response shapes are pure and
 * tested there; this adds the network and the deadline every outbound call gets (rule 29).
 * Injected `fetch` so it has a test seam, though the store above it is exercised through
 * its own fake embedder rather than this.
 */
import { buildEmbeddingRequest, parseEmbeddingResponse } from '../../../shared/embedding.ts';
import { formatError } from '../../../shared/utilities/format-error.ts';
import { ok, err } from '../../../shared/result.ts';
import type { Result } from '../../../shared/result.ts';
import type { Embedder } from './sqlite-memory-store.ts';

export type EmbedderFetch = (
  url: string,
  init: { readonly method: string; readonly headers: Readonly<Record<string, string>>; readonly body: string; readonly signal: AbortSignal }
) => Promise<{ readonly ok: boolean; readonly status: number; readonly json: () => Promise<unknown> }>;

export type EmbedderConfig = {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
};

const TIMEOUT_MS = 20_000;

export const createEmbedder =
  (fetchImpl: EmbedderFetch, config: EmbedderConfig): Embedder =>
  async (text: string): Promise<Result<readonly number[], string>> => {
    const request = buildEmbeddingRequest({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, text });
    try {
      const response = await fetchImpl(request.url, { method: 'POST', headers: request.headers, body: request.body, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) return err(`the embedding provider answered ${response.status}`);
      const vector = parseEmbeddingResponse(await response.json());
      return vector === undefined ? err('the embedding provider returned no usable vector') : ok(vector);
    } catch (caught) {
      return err(formatError(caught));
    }
  };
