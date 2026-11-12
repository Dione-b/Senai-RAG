/**
 * Baixa os arquivos do modelo de embeddings e copia o WASM do ONNX Runtime
 * para a pasta public/, tornando o app 100% self-hosted (funciona offline via PWA).
 *
 * Uso: npm run model:download
 *
 * Arquivos gerados (ignorados pelo git):
 *   public/models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/**
 *   public/onnx/**
 */
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main`;

/** Arquivos que o transformers.js carrega ao criar o pipeline (dtype q8). */
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'unigram.json',
  'onnx/model_quantized.onnx',
];

/** Binários do ONNX Runtime (usados via env.backends.onnx.wasm.wasmPaths). */
const ORT_FILES = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
];

function formatBytes(n) {
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

async function fileMatches(filePath, expectedSize) {
  if (!existsSync(filePath)) return false;
  if (expectedSize == null) return true;
  try {
    const info = await stat(filePath);
    return info.size === expectedSize;
  } catch {
    return false;
  }
}

async function downloadFile(url, dest) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao baixar ${url}`);
  }
  const total = Number(response.headers.get('content-length')) || 0;
  await mkdir(path.dirname(dest), { recursive: true });

  let lastPrint = 0;
  const source = Readable.fromWeb(response.body);
  source.on('data', (chunk) => {
    lastPrint += chunk.length;
    if (total > 0 && Date.now() - lastPrint > 0 && lastPrint % (1024 * 1024) < chunk.length) {
      process.stdout.write(`\r  ${Math.floor((lastPrint / total) * 100)}% (${formatBytes(lastPrint)}/${formatBytes(total)})`);
    }
  });

  await pipeline(source, createWriteStream(dest));
  if (total > 0) process.stdout.write(`\r  100% (${formatBytes(total)})`);
  process.stdout.write('\n');
}

async function main() {
  const modelDir = path.join(root, 'public', 'models', MODEL_ID);
  await mkdir(modelDir, { recursive: true });

  console.log(`Modelo: ${MODEL_ID}`);
  for (const file of MODEL_FILES) {
    const dest = path.join(modelDir, file);
    if (existsSync(dest)) {
      console.log(`✓ ${file} (já existe)`);
      continue;
    }
    console.log(`↓ ${file}`);
    await downloadFile(`${BASE_URL}/${file}`, dest);
  }

  console.log('\nONNX Runtime (copiando de node_modules/onnxruntime-web/dist):');
  const ortSrc = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
  const ortDest = path.join(root, 'public', 'onnx');
  await mkdir(ortDest, { recursive: true });
  for (const file of ORT_FILES) {
    const src = path.join(ortSrc, file);
    const dest = path.join(ortDest, file);
    if (!existsSync(src)) {
      console.warn(`! arquivo ausente: ${src} (rode "npm install")`);
      continue;
    }
    const { size } = await stat(dest).catch(() => ({ size: -1 }));
    const { size: srcSize } = await stat(src);
    if (size === srcSize) {
      console.log(`✓ ${file} (já existe)`);
      continue;
    }
    const response = await fetch(`file://${src.replaceAll('\\', '/')}`).catch(() => null);
    if (response?.ok) {
      await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
    } else {
      // fallback simples (Windows): cópia binária
      const { copyFile } = await import('node:fs/promises');
      await copyFile(src, dest);
    }
    console.log(`✓ ${file} (${formatBytes(srcSize)})`);
  }

  console.log('\nPronto. Rode "npm run build" para incluir no dist/.');
}

main().catch((err) => {
  console.error('Falha no download:', err.message);
  process.exit(1);
});
