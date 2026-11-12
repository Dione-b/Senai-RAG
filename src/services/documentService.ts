import type { BindingSpec, Database } from '@sqlite.org/sqlite-wasm';
import type { Document } from '../types/document';
import type { RelevantChunk } from '../types/search';
import { chunkText as chunkTextService } from './chunking';
import { getDatabase, inTransaction, schedulePersist } from './database';
import { embedTexts } from './embeddingService';
import { MIN_SIMILARITY, similarityToBytes, vectorToBytes } from './vectors';

function queryAll<T>(db: Database, sql: string, bind: BindingSpec = []): T[] {
  return db.exec(sql, {
    bind,
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as T[];
}

function run(db: Database, sql: string, bind: BindingSpec = []): void {
  db.exec(sql, { bind });
}

function chunkText(text: string): string[] {
  return chunkTextService(text).map((c) => c.content);
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AddDocumentResult extends Document {
  /** Quantos chunks receberam vetor de embedding. */
  embedded: number;
  /** Total de chunks do documento. */
  totalChunks: number;
}

/** Grava vetores nos chunks; retorna quantos foram vetorizados (0 = falhou). */
async function embedChunks(entries: { id: string; content: string }[]): Promise<number> {
  if (entries.length === 0) return 0;
  try {
    const vectors = await embedTexts(entries.map((entry) => entry.content));
    if (vectors.length !== entries.length) {
      throw new Error('Quantidade de vetores divergente dos chunks.');
    }

    const db = await getDatabase();
    inTransaction(db, () => {
      entries.forEach((entry, index) => {
        run(db, 'UPDATE chunks SET embedding = ? WHERE id = ?', [
          vectorToBytes(vectors[index]),
          entry.id,
        ]);
      });
    });
    schedulePersist();
    return vectors.length;
  } catch (err) {
    // Modelo indisponível (ex.: offline sem cache): mantém busca textual.
    console.warn('Vetorização indisponível; busca textual segue ativa.', err);
    return 0;
  }
}

let backfillRunning = false;

/**
 * Vetoriza chunks ainda sem embedding (anexados com o modelo indisponível).
 * Dispara e esquece: otimização progressiva que nunca bloqueia a busca.
 */
async function backfillEmbeddings(limit = 200): Promise<void> {
  if (backfillRunning) return;
  backfillRunning = true;
  try {
    const db = await getDatabase();
    const rows = queryAll<{ id: string; content: string }>(
      db,
      'SELECT id, content FROM chunks WHERE embedding IS NULL LIMIT ?',
      [limit],
    );
    if (rows.length > 0) await embedChunks(rows);
  } catch {
    // silencioso: a próxima busca tenta novamente
  } finally {
    backfillRunning = false;
  }
}

async function ftsTableExists(db: Database): Promise<boolean> {
  const rows = queryAll<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chunks_fts'",
  );
  return rows.length > 0;
}

function toTokens(question: string): string[] {
  return question
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function toFtsExpression(question: string): string {
  const tokens = toTokens(question);
  if (tokens.length === 0) return '""';
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' OR ');
}

export async function listDocuments(): Promise<Document[]> {
  const db = await getDatabase();
  const rows = queryAll<{ id: string; title: string; created_at: number }>(
    db,
    'SELECT id, title, created_at FROM documents ORDER BY created_at DESC',
  );

  return rows.map((row) => {
    const chunks = queryAll<{ content: string }>(
      db,
      'SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC',
      [row.id],
    );
    return {
      id: row.id,
      title: row.title,
      content: chunks.map((c) => c.content).join(''),
      createdAt: row.created_at,
    };
  });
}

export async function getDocumentContent(id: string): Promise<string> {
  const db = await getDatabase();
  const chunks = queryAll<{ content: string }>(
    db,
    'SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC',
    [id],
  );
  return chunks.map((c) => c.content).join('');
}

export async function addDocument(title: string, content: string): Promise<AddDocumentResult> {
  const db = await getDatabase();
  const id = newId();
  const createdAt = Date.now();
  const chunks = chunkText(content);
  const hasFts = await ftsTableExists(db);

  inTransaction(db, () => {
    run(db, 'INSERT INTO documents (id, title, created_at) VALUES (?, ?, ?)', [
      id,
      title.trim(),
      createdAt,
    ]);

    chunks.forEach((chunk, index) => {
      const chunkId = `${id}-${index}`;
      run(db, 'INSERT INTO chunks (id, document_id, chunk_index, content) VALUES (?, ?, ?, ?)', [
        chunkId,
        id,
        index,
        chunk,
      ]);
      if (hasFts) {
        run(db, 'INSERT INTO chunks_fts (content, chunk_id) VALUES (?, ?)', [chunk, chunkId]);
      }
    });
  });

  schedulePersist();

  // Vetorização semântica logo após o anexo (se o modelo estiver disponível).
  const embedded = await embedChunks(
    chunks.map((chunk, index) => ({ id: `${id}-${index}`, content: chunk })),
  );

  return {
    id,
    title: title.trim(),
    content: content.trim(),
    createdAt,
    embedded,
    totalChunks: chunks.length,
  };
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDatabase();
  const hasFts = await ftsTableExists(db);

  inTransaction(db, () => {
    const chunks = queryAll<{ id: string }>(
      db,
      'SELECT id FROM chunks WHERE document_id = ?',
      [id],
    );
    if (hasFts) {
      chunks.forEach((chunk) => run(db, 'DELETE FROM chunks_fts WHERE chunk_id = ?', [chunk.id]));
    }
    run(db, 'DELETE FROM chunks WHERE document_id = ?', [id]);
    run(db, 'DELETE FROM documents WHERE id = ?', [id]);
  });

  schedulePersist();
}

// Fallback usado quando FTS5 não está disponível: busca por LIKE e ordena
// pelo número de tokens encontrados.
async function searchChunksByLike(question: string, limit: number): Promise<RelevantChunk[]> {
  const db = await getDatabase();
  const tokens = toTokens(question).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];

  const orClause = tokens.map(() => 'c.content LIKE ?').join(' OR ');
  const params = tokens.map((t) => `%${t}%`);

  const rows = queryAll<{ content: string; title: string }>(
    db,
    `SELECT c.content AS content, d.title AS title
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE ${orClause}
     LIMIT 200`,
    params,
  );

  const lower = tokens.map((t) => t.toLowerCase());
  const scored = rows
    .map((r) => {
      const haystack = r.content.toLowerCase();
      const hits = lower.filter((t) => haystack.includes(t)).length;
      return { content: r.content, title: r.title, rank: -hits };
    })
    .filter((r) => r.rank < 0);

  scored.sort((a, b) => a.rank - b.rank);
  return scored.slice(0, limit);
}

export async function searchRelevantChunks(
  question: string,
  limit = 5,
): Promise<RelevantChunk[]> {
  // 1) Semântico: embedding da pergunta + similaridade de cosseno.
  //    Funciona com paráfrases e sinônimos (palavras diferentes do documento).
  try {
    const [queryVector] = await embedTexts([question]);
    if (queryVector) {
      // de passagem, vetoriza chunks pendentes p/ as próximas buscas
      void backfillEmbeddings();

      const semanticDb = await getDatabase();
      const rows = queryAll<{ content: string; title: string; embedding: Uint8Array | null }>(
        semanticDb,
        `SELECT c.content AS content, d.title AS title, c.embedding AS embedding
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
         WHERE c.embedding IS NOT NULL`,
      );

      if (rows.length > 0) {
        const ranked = rows
          .map((row) => ({
            content: row.content,
            title: row.title,
            rank: similarityToBytes(queryVector, row.embedding),
          }))
          .filter((row) => Number.isFinite(row.rank));

        const best = ranked.length > 0 ? Math.max(...ranked.map((r) => r.rank)) : null;
        console.debug(
          `[busca semântica] ${rows.length} trecho(s) indexado(s); ` +
            `melhor similaridade=${best === null ? 'n/d' : best.toFixed(3)} ` +
            `(limiar ${MIN_SIMILARITY})`,
        );

        // Veredito final da semântica: [] significa "nada relevante" e não
        // cai no léxico (evita falso positivo por stopword, ex.: "para").
        return ranked
          .filter((row) => row.rank >= MIN_SIMILARITY)
          .sort((a, b) => b.rank - a.rank)
          .slice(0, limit);
      }
      // Nada vetorizado ainda → tenta o léxico.
    }
  } catch {
    // Modelo indisponível (ex.: offline sem cache) → tenta o léxico.
  }

  // 2) Léxico: FTS5/BM25 com fallback LIKE (comportamento original).
  return searchLexically(question, limit);
}

async function searchLexically(question: string, limit: number): Promise<RelevantChunk[]> {
  const db = await getDatabase();

  if (!(await ftsTableExists(db))) {
    return searchChunksByLike(question, limit);
  }

  const expression = toFtsExpression(question);
  if (expression === '""') return [];

  const rows = queryAll<{ content: string; title: string; rank: number }>(
    db,
    `SELECT c.content AS content, d.title AS title, bm25(chunks_fts) AS rank
     FROM chunks_fts
     JOIN chunks c ON c.id = chunks_fts.chunk_id
     JOIN documents d ON d.id = c.document_id
     WHERE chunks_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [expression, limit],
  );

  return rows.map((r) => ({ content: r.content, title: r.title, rank: r.rank }));
}