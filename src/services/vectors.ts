/**
 * Utilidades puras para vetores de embedding (similaridade de cosseno).
 * Sem dependências de browser/SQLite — testável em Node.
 */

/** Similaridade mínima para considerar um trecho semanticamente relevante. */
export const MIN_SIMILARITY = 0.25;

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Converte o vetor para bytes (BLOB do SQLite). Sempre copia. */
export function vectorToBytes(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength).slice();
}

/** Recupera o vetor de um BLOB do SQLite. Retorna vazio se corrompido. */
export function bytesToVector(bytes: Uint8Array | ArrayBuffer | null | undefined): Float32Array {
  if (!bytes) return new Float32Array(0);
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteLength === 0 || view.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    return new Float32Array(0);
  }
  // Copia para garantir buffer com byteOffset 0 e alinhamento correto.
  const copy = view.slice();
  return new Float32Array(copy.buffer);
}

/** Similaridade entre um vetor e um BLOB; 0 se dimensões divergirem. */
export function similarityToBytes(query: Float32Array, blob: Uint8Array | null): number {
  return cosineSimilarity(query, bytesToVector(blob));
}
