/*
 * The arithmetic behind searching memory: how close two embeddings are.
 *
 * Cosine similarity, which is what an embedding model's vectors are meant to be compared
 * with. Pure and tiny, so it is tested and mutation-covered here rather than hidden inside
 * the native store adapter, which the bun runner cannot load.
 */
export type Embedding = readonly number[];

// The dot product over the magnitudes: 1 is identical direction, 0 is unrelated. A
// zero-length vector has no direction to compare, so it scores 0 rather than dividing by
// zero.
export const cosineSimilarity = (a: Embedding, b: Embedding): number => {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index++) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
};

export type Scored<T> = { readonly item: T; readonly score: number };

// The top `limit` items by similarity to the query, most similar first. Below-threshold
// hits are dropped: a memory search that returns everything, ranked, is not an answer to
// "do you know about X", it is a list.
export const topBySimilarity = <T>(
  query: Embedding,
  candidates: readonly { readonly item: T; readonly embedding: Embedding }[],
  limit: number,
  threshold = 0
): readonly Scored<T>[] =>
  candidates
    .map((candidate) => ({ item: candidate.item, score: cosineSimilarity(query, candidate.embedding) }))
    .filter((scored) => scored.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit));
