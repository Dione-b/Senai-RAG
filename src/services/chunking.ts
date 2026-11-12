export interface TextChunk {
  index: number;
  content: string;
}

const MIN_CHARS = 900;
const MAX_CHARS = 1200;
const TARGET_CHARS = 1050;
const OVERLAP_CHARS = 150;

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function buildBreakpoints(text: string): Set<number> {
  const breaks = new Set<number>();
  breaks.add(0);
  breaks.add(text.length);

  for (let i = 0; i < text.length; i += 1) {
    // paragraph boundary
    if (text[i] === '\n' && text[i + 1] === '\n') {
      breaks.add(i + 2);
    }
    // sentence boundary
    if ('.!?'.includes(text[i]) && (text[i + 1] === ' ' || text[i + 1] === '\n')) {
      breaks.add(i + 1);
    }
  }

  return breaks;
}

function largestBreakAtOrBefore(breaks: Set<number>, position: number, min: number): number | null {
  let result: number | null = null;
  for (const b of breaks) {
    if (b <= position && b >= min) {
      if (result === null || b > result) result = b;
    }
  }
  return result;
}

function bestBreakInRange(breaks: Set<number>, start: number, minEnd: number, maxEnd: number, targetEnd: number): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const b of breaks) {
    if (b >= minEnd && b <= maxEnd) {
      const distance = Math.abs(b - targetEnd);
      if (distance < bestDistance) {
        best = b;
        bestDistance = distance;
      }
    }
  }
  // ensure progress beyond start
  if (best !== null && best <= start) return null;
  return best;
}

export function chunkText(text: string): TextChunk[] {
  const cleaned = normalizeText(text);
  if (!cleaned) return [];

  if (cleaned.length <= MAX_CHARS) {
    return [{ index: 0, content: cleaned }];
  }

  const breaks = buildBreakpoints(cleaned);
  const chunks: { content: string }[] = [];

  let start = 0;
  while (start < cleaned.length) {
    const remaining = cleaned.length - start;
    if (remaining <= MAX_CHARS) {
      const content = cleaned.slice(start).trim();
      if (content) chunks.push({ content });
      break;
    }

    const minEnd = Math.min(start + MIN_CHARS, cleaned.length);
    const maxEnd = Math.min(start + MAX_CHARS, cleaned.length);
    const targetEnd = Math.min(start + TARGET_CHARS, cleaned.length);

    let end = bestBreakInRange(breaks, start, minEnd, maxEnd, targetEnd);
    if (end === null) {
      // fallback: hard cut at max
      end = maxEnd;
    }
    if (end <= start) {
      end = Math.min(start + MAX_CHARS, cleaned.length);
    }

    const content = cleaned.slice(start, end).trim();
    if (content) chunks.push({ content });

    if (end >= cleaned.length) break;

    const candidateStart = end - OVERLAP_CHARS;
    const snapped = largestBreakAtOrBefore(breaks, candidateStart, start + 1);
    start = snapped !== null ? snapped : Math.max(start + 1, candidateStart);
    if (start >= end) start = end;
  }

  // discard empties and re-index
  return chunks
    .map((c) => c.content.trim())
    .filter((c) => c.length > 0)
    .map((content, index) => ({ index, content }));
}