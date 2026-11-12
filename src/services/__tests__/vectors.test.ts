import { describe, expect, it } from 'vitest';
import {
  bytesToVector,
  cosineSimilarity,
  MIN_SIMILARITY,
  similarityToBytes,
  vectorToBytes,
} from '../vectors';

describe('vectors (similaridade de cosseno)', () => {
  it('vetor idêntico tem similaridade 1', () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });

  it('vetores ortogonais têm similaridade 0', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 6);
  });

  it('é invariante à escala (vetores normalizados)', () => {
    const a = new Float32Array([1, 1]);
    const b = new Float32Array([5, 5]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
  });

  it('dimensões diferentes ou vazias retornam 0', () => {
    expect(cosineSimilarity(new Float32Array([1]), new Float32Array([1, 2]))).toBe(0);
    expect(cosineSimilarity(new Float32Array(0), new Float32Array(0))).toBe(0);
  });

  it('vetor nulo retorna 0 (sem NaN)', () => {
    const zero = new Float32Array([0, 0, 0]);
    const other = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(zero, other)).toBe(0);
  });

  it('roundtrip bytes <-> vetor preserva valores', () => {
    const v = new Float32Array([0.25, -0.5, 1.5, 0]);
    const restored = bytesToVector(vectorToBytes(v));
    expect(Array.from(restored)).toEqual(Array.from(v));
  });

  it('bytesToVector tolera entradas inválidas', () => {
    expect(bytesToVector(null)).toHaveLength(0);
    expect(bytesToVector(new Uint8Array(3))).toHaveLength(0); // não múltiplo de 4
  });

  it('similarityToBytes ignora blob nulo', () => {
    const q = new Float32Array([1, 2]);
    expect(similarityToBytes(q, null)).toBe(0);
    expect(similarityToBytes(q, vectorToBytes(q))).toBeCloseTo(1, 6);
  });

  it('limiar é um valor de cosseno válido', () => {
    expect(MIN_SIMILARITY).toBeGreaterThan(0);
    expect(MIN_SIMILARITY).toBeLessThan(1);
  });
});
