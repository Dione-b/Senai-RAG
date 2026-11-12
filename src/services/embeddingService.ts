/**
 * Fachada na thread principal para o worker de embeddings.
 *
 * Fora do browser (testes/Node) as chamadas rejeitam e o app cai no
 * fallback léxico (FTS5) — este módulo nunca pode quebrar importação em Node.
 */
import type { WorkerOutMessage } from './embeddingWorker';

export type EmbeddingProgress = {
  /** 'initiate' | 'download' | 'progress' | 'done' | 'load' | 'ready' | 'embedding' */
  status: string;
  file?: string;
  progress?: number; // 0..100
};

type Pending = {
  resolve: (vectors: Float32Array[]) => void;
  reject: (err: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
const listeners = new Set<(progress: EmbeddingProgress) => void>();

function isBrowser(): boolean {
  return typeof Worker !== 'undefined' && typeof document !== 'undefined';
}

function emit(progress: EmbeddingProgress): void {
  listeners.forEach((listener) => listener(progress));
}

function failAll(message: string): void {
  pending.forEach((entry) => entry.reject(new Error(message)));
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  if (!isBrowser()) {
    throw new Error('Vetorização indisponível neste ambiente (sem Web Worker).');
  }

  const created = new Worker(new URL('./embeddingWorker.ts', import.meta.url), {
    type: 'module',
  });

  created.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
    const message = event.data;
    if (message.kind === 'progress') {
      emit({ status: message.status, file: message.file, progress: message.progress });
      return;
    }

    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);

    if (message.kind === 'error') {
      entry.reject(new Error(message.message));
      return;
    }

    const flat = new Float32Array(message.data);
    const vectors: Float32Array[] = [];
    if (message.dims > 0) {
      for (let i = 0; i + message.dims <= flat.length; i += message.dims) {
        vectors.push(flat.slice(i, i + message.dims));
      }
    }
    entry.resolve(vectors);
  };

  created.onerror = () => {
    // Worker quebrou (ex.: arquivo do modelo ausente): rejeita tudo e
    // permite nova tentativa na próxima chamada.
    failAll('Worker de embeddings falhou (verifique "npm run model:download").');
    created.terminate();
    if (worker === created) worker = null;
  };

  worker = created;
  return created;
}

/**
 * Vetoriza uma lista de textos. Rejeita quando o modelo/worker está
 * indisponível — o chamador deve cair para o fallback léxico.
 */
export function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return Promise.resolve([]);

  let instance: Worker;
  try {
    instance = getWorker();
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }

  const id = nextId;
  nextId += 1;

  return new Promise<Float32Array[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    instance.postMessage({ id, kind: 'embed', texts });
  });
}

/** Assina atualizações de progresso (download/carregamento do modelo). */
export function onEmbeddingProgress(
  listener: (progress: EmbeddingProgress) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Texto amigável para exibir na UI, ou null quando não há nada a dizer. */
export function describeEmbeddingProgress(progress: EmbeddingProgress): string | null {
  switch (progress.status) {
    case 'embedding':
      return 'Vetorizando trechos...';
    case 'load':
      return 'Carregando modelo na memória...';
    case 'ready':
      return null;
    case 'progress':
      return typeof progress.progress === 'number'
        ? `Baixando modelo de busca: ${Math.round(progress.progress)}%`
        : 'Baixando modelo de busca...';
    case 'initiate':
    case 'download':
      return 'Baixando modelo de busca...';
    default:
      return null;
  }
}
