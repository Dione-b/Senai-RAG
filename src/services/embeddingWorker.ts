/**
 * Web Worker de embeddings: carrega o modelo e vetoriza textos FORA da
 * thread principal (a inferência não pode travar a UI).
 *
 * Tudo self-hosted para o PWA funcionar offline:
 *   - modelo:      public/models/...      (npm run model:download)
 *   - ONNX Runtime: public/onnx/          (cópia de node_modules)
 */
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const DTYPE = 'q8'; // ~113 MB, padrão recomendado para WASM
const BATCH_SIZE = 16;

export type EmbedRequest = { id: number; texts: string[] };
export type WorkerOutMessage =
  | { kind: 'progress'; status: string; file?: string; progress?: number }
  | { kind: 'result'; id: number; dims: number; data: ArrayBuffer }
  | { kind: 'error'; id: number; message: string };

// --- Configuração self-hosted ------------------------------------------------
// No browser, allowLocalModels vem `false` por padrão: precisa ligar.
env.allowLocalModels = true;
env.allowRemoteModels = false; // nunca buscar no Hugging Face Hub
env.localModelPath = '/models/';
// O service worker já cacheia esses arquivos em contexto seguro
// (https/localhost) — evitar duplicar ~150 MB em cache. Em http://IP
// (celular na rede, sem service worker) usa o cache nativo do
// transformers.js para não baixar o modelo a cada sessão.
const canUseCacheApi = typeof self.caches !== 'undefined';
const useOwnCache = !self.isSecureContext && canUseCacheApi;
env.useBrowserCache = useOwnCache;
env.useWasmCache = useOwnCache;

if (env.backends.onnx?.wasm) {
  // Caminhos do ONNX Runtime (senão o transformers.js baixa do CDN jsdelivr).
  env.backends.onnx.wasm.wasmPaths = {
    mjs: '/onnx/ort-wasm-simd-threaded.asyncify.mjs',
    wasm: '/onnx/ort-wasm-simd-threaded.asyncify.wasm',
  } as unknown as typeof env.backends.onnx.wasm.wasmPaths;
}

// Cast do `self` para contexto de DedicatedWorker (tsconfig usa lib DOM).
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<EmbedRequest>) => void) | null;
  postMessage(message: WorkerOutMessage, transfer?: Transferable[]): void;
};

function post(message: WorkerOutMessage, transfer: Transferable[] = []): void {
  workerScope.postMessage(message, transfer);
}

type ProgressReport = { status?: unknown; file?: unknown; progress?: unknown };

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    const promise = pipeline('feature-extraction', MODEL_ID, {
      dtype: DTYPE,
      progress_callback: (report: unknown) => {
        const data = report as ProgressReport;
        post({
          kind: 'progress',
          status: typeof data.status === 'string' ? data.status : 'progress',
          file: typeof data.file === 'string' ? data.file : undefined,
          progress: typeof data.progress === 'number' ? data.progress : undefined,
        });
      },
    });
    // Libera a promessa para nova tentativa em caso de falha (ex.: offline
    // sem o modelo em cache); quem chama ainda recebe o erro.
    extractorPromise = promise.catch((err: unknown) => {
      extractorPromise = null;
      throw err;
    });
  }
  return extractorPromise;
}

async function embed(texts: string[]): Promise<{ dims: number; data: Float32Array }> {
  const extractor = await getExtractor();
  post({ kind: 'progress', status: 'embedding' });

  const vectors: Float32Array[] = [];
  let dims = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const output = await extractor(batch, { pooling: 'mean', normalize: true });
    const data = output.data as Float32Array;
    dims = output.dims[output.dims.length - 1] ?? 0;
    if (!dims || data.length !== batch.length * dims) {
      throw new Error(`Saída inesperada do modelo (dims=${dims}, len=${data.length}).`);
    }
    for (let row = 0; row < batch.length; row += 1) {
      vectors.push(data.slice(row * dims, (row + 1) * dims));
    }
  }

  const flat = new Float32Array(vectors.length * dims);
  vectors.forEach((v, i) => flat.set(v, i * dims));
  return { dims, data: flat };
}

workerScope.onmessage = (event) => {
  const { id, texts } = event.data ?? ({ id: 0, texts: [] } as EmbedRequest);

  void (async () => {
    try {
      if (!Array.isArray(texts) || texts.length === 0) {
        post({ kind: 'result', id, dims: 0, data: new ArrayBuffer(0) });
        return;
      }
      const { dims, data } = await embed(texts);
      const buffer = data.buffer as ArrayBuffer;
      post({ kind: 'result', id, dims, data: buffer }, [buffer]);
    } catch (err) {
      post({
        kind: 'error',
        id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
};
