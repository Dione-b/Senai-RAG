import sqlite3InitModule, {
  type Database as SqliteDatabase,
  type Sqlite3Static,
} from '@sqlite.org/sqlite-wasm';
import { loadBytes, saveBytes } from './persistence';

const HEADER = 'SQLite format 3\0';
const PERSIST_DELAY_MS = 250;

let sqlite3: Sqlite3Static | null = null;
let database: SqliteDatabase | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistChain: Promise<void> = Promise.resolve();

function isValidSqliteImage(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16) return false;
  for (let i = 0; i < HEADER.length; i += 1) {
    if (bytes[i] !== HEADER.charCodeAt(i)) return false;
  }
  return true;
}

function restore(target: SqliteDatabase, bytes: Uint8Array): void {
  const s = sqlite3;
  if (!s) throw new Error('SQLite não inicializado.');
  const dbPointer = target.pointer;
  if (!dbPointer) throw new Error('Banco fechado antes da restauração.');
  const pointer = s.wasm.allocFromTypedArray(bytes);
  const rc = s.capi.sqlite3_deserialize(
    dbPointer,
    'main',
    pointer,
    bytes.byteLength,
    bytes.byteLength,
    s.capi.SQLITE_DESERIALIZE_FREEONCLOSE | s.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
  if (rc !== 0) throw new Error(`Falha ao restaurar o banco (rc=${rc}).`);
}

/**
 * Migrações idempotentes: podem rodar quantas vezes for preciso.
 */
export function migrate(db: SqliteDatabase): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
    );
  `);

  // Vetores de embedding (Float32Array em BLOB). Migração idempotente para
  // bancos criados antes da busca semântica existir.
  const columns = db.exec('PRAGMA table_info(chunks)', {
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as { name: string }[];
  if (!columns.some((c) => c.name === 'embedding')) {
    db.exec('ALTER TABLE chunks ADD COLUMN embedding BLOB');
  }

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5 (
        content,
        chunk_id UNINDEXED
      );
    `);
  } catch {
    // FTS5 indisponível neste build: o serviço usa fallback LIKE.
  }
}

export async function getDatabase(): Promise<SqliteDatabase> {
  if (database) return database;

  sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(':memory:', 'c');

  const stored = await loadBytes();
  if (stored && isValidSqliteImage(stored)) {
    restore(db, stored);
  }

  migrate(db);
  database = db;
  return db;
}

/** Marca o banco como sujo e agenda a gravação (debounce). */
export function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistChain = persistChain.then(persistNow).catch((err) => {
      console.error('Falha ao persistir o banco:', err);
    });
  }, PERSIST_DELAY_MS);
}

/** Grava imediatamente. Útil em testes e antes de sair da página. */
export async function persistNow(): Promise<void> {
  if (!database || !sqlite3) return;
  const bytes = sqlite3.capi.sqlite3_js_db_export(database);
  await saveBytes(bytes);
}

/** Aguarda a gravação pendente (usado em testes). */
export async function flushPersist(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await persistChain;
}

/** Executa `fn` dentro de uma transação; faz rollback se algo falhar. */
export function inTransaction<T>(db: SqliteDatabase, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // rollback best-effort
    }
    throw err;
  }
}