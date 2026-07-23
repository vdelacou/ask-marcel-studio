import { describe, expect, test } from 'bun:test';
import { buildEmbeddingRequest, parseEmbeddingResponse } from './embedding.ts';

describe('asking a provider to embed some text', () => {
  test('the request goes to the embeddings endpoint, with the key and the model', () => {
    const request = buildEmbeddingRequest({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-key', model: 'gemini-embedding', text: 'Weilai is my CTO' });

    expect(request.url).toBe('https://api.example.com/v1/embeddings');
    expect(request.headers['authorization']).toBe('Bearer sk-key');
    expect(JSON.parse(request.body)).toEqual({ model: 'gemini-embedding', input: 'Weilai is my CTO' });
  });

  test('a base url without /v1 gets it, and one with it does not get it twice', () => {
    expect(buildEmbeddingRequest({ baseUrl: 'https://x', apiKey: 'k', model: 'm', text: 't' }).url).toBe('https://x/v1/embeddings');
    expect(buildEmbeddingRequest({ baseUrl: 'https://x/v1/', apiKey: 'k', model: 'm', text: 't' }).url).toBe('https://x/v1/embeddings');
  });
});

describe('reading back the vector', () => {
  test('a well-formed response gives the embedding', () => {
    expect(parseEmbeddingResponse({ data: [{ embedding: [0.1, 0.2, 0.3] }] })).toEqual([0.1, 0.2, 0.3]);
  });

  test('a response with no data is no vector, rather than an empty one that breaks search', () => {
    expect(parseEmbeddingResponse({ data: [] })).toBeUndefined();
    expect(parseEmbeddingResponse({})).toBeUndefined();
    expect(parseEmbeddingResponse('nonsense')).toBeUndefined();
  });

  test('an embedding that is not an array of numbers is refused', () => {
    expect(parseEmbeddingResponse({ data: [{ embedding: 'nope' }] })).toBeUndefined();
    expect(parseEmbeddingResponse({ data: [{ embedding: [] }] })).toBeUndefined();
  });

  test('non-finite values are dropped, and if nothing finite is left it is no vector', () => {
    expect(parseEmbeddingResponse({ data: [{ embedding: [1, 'x', 2] }] })).toEqual([1, 2]);
    expect(parseEmbeddingResponse({ data: [{ embedding: [Number.NaN, Number.POSITIVE_INFINITY] }] })).toBeUndefined();
  });
});
