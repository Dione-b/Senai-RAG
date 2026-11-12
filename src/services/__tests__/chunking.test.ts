import { describe, expect, it } from 'vitest';
import { chunkText } from '../chunking';

function makeParagraph(length: number, seed = 'a'): string {
  return seed.repeat(length);
}

describe('chunkText', () => {
  it('returns empty array for empty/whitespace input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    const text = 'Texto curto.';
    const result = chunkText(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ index: 0, content: text });
  });

  it('returns chunks with index and content', () => {
    const para = makeParagraph(1000, 'a');
    const result = chunkText(para);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
      expect(typeof chunk.content).toBe('string');
      expect(chunk.content.length).toBeGreaterThan(0);
    });
  });

  it('keeps chunk sizes within 900-1200 when possible', () => {
    const text = [makeParagraph(500, 'a'), makeParagraph(500, 'b'), makeParagraph(500, 'c')].join(
      '\n\n',
    );
    const result = chunkText(text);
    for (const chunk of result) {
      expect(chunk.content.length).toBeGreaterThanOrEqual(900);
      expect(chunk.content.length).toBeLessThanOrEqual(1200);
    }
  });

  it('has approximate overlap of ~150 chars between consecutive chunks', () => {
    const text = makeParagraph(2500, 'x');
    const result = chunkText(text);
    expect(result.length).toBeGreaterThan(1);
    for (let i = 1; i < result.length; i += 1) {
      const prev = result[i - 1].content;
      const curr = result[i].content;
      const tail = prev.slice(-150);
      expect(curr.includes(tail.slice(-30))).toBe(true);
    }
  });

  it('preserves sentence boundaries when possible', () => {
    const sentence = 'Esta e uma frase completa. ';
    const text = sentence.repeat(60);
    const result = chunkText(text);
    expect(result.length).toBeGreaterThan(0);
    const last = result[result.length - 1].content;
    expect(last.trim().length).toBeGreaterThan(0);
  });

  it('discards empty paragraphs', () => {
    const text =
      'Primeiro paragrafo com texto suficiente. '.repeat(30) +
      '\n\n\n\n' +
      'Segundo paragrafo. '.repeat(30);
    const result = chunkText(text);
    for (const chunk of result) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
  });

  it('returns sequential indices', () => {
    const text = makeParagraph(3000, 'z');
    const result = chunkText(text);
    result.forEach((chunk, i) => expect(chunk.index).toBe(i));
  });
});