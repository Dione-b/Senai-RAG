import { describe, expect, it } from 'vitest';
import { addDocument, deleteDocument, listDocuments, searchRelevantChunks } from '../documentService';
import { getDatabase } from '../database';

describe('documentService (SQLite WASM + FTS5)', () => {
  it('cria migrações idempotentes', async () => {
    const db = await getDatabase();
    db.exec('DROP TABLE IF EXISTS chunks_fts');
    db.exec('DROP TABLE IF EXISTS chunks');
    db.exec('DROP TABLE IF EXISTS documents');

    const { migrate } = await import('../database');
    migrate(db);
    migrate(db); // segunda vez não pode falhar

    const tables = db.exec(
      "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name IN ('documents','chunks','chunks_fts') ORDER BY name",
      { rowMode: 'object', returnValue: 'resultRows' },
    ) as { name: string }[];

    expect(tables.map((t) => t.name)).toEqual(['chunks', 'chunks_fts', 'documents']);
  });

  it('salva documento com chunks e índice FTS sincronizados', async () => {
    const doc = await addDocument('Notas de teste', 'busca textual pocketrag com frases.');
    expect(doc.title).toBe('Notas de teste');

    const docs = await listDocuments();
    const saved = docs.find((d) => d.id === doc.id);
    expect(saved).toBeDefined();
    expect(saved?.content).toContain('busca textual');

    const hits = await searchRelevantChunks('pocketrag');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toBe('Notas de teste');
    expect(typeof hits[0].rank).toBe('number');
  });

  it('retorna lista vazia quando não há correspondência', async () => {
    const hits = await searchRelevantChunks('zzzznaoexisteqq');
    expect(hits).toEqual([]);
  });

  it('remove chunks e índice junto com o documento', async () => {
    const doc = await addDocument('Descartar', 'conteudo temporario para exclusao.');
    await deleteDocument(doc.id);

    const docs = await listDocuments();
    expect(docs.find((d) => d.id === doc.id)).toBeUndefined();

    const hits = await searchRelevantChunks('temporario');
    expect(hits.find((h) => h.title === 'Descartar')).toBeUndefined();
  });
});