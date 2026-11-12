import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Em dev, Vite se recusa a servir arquivos de /public como módulos
 * (erro "should not be imported from source code"). O ONNX Runtime, porém,
 * faz `import('/onnx/ort-wasm-simd-threaded.asyncify.mjs')` nativamente em
 * navegadores Chrome (sem blob URL). Em produção isso funciona (arquivo
 * estático). Este plugin espelha esse comportamento em dev.
 */
function serveOnnxPublicFiles(): Plugin {
  return {
    name: 'serve-onnx-public-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        let urlPath: string;
        try {
          urlPath = decodeURIComponent(req.url.split('?')[0]);
        } catch {
          return next();
        }
        if (!urlPath.startsWith('/onnx/')) return next();

        const publicOnnxDir = path.join(__dirname, 'public', 'onnx');
        const filePath = path.join(__dirname, 'public', urlPath);
        // Segurança: impedir path traversal fora de public/onnx
        if (!filePath.startsWith(publicOnnxDir)) return next();
        let stat: fs.Stats;
        try {
          stat = fs.statSync(filePath);
        } catch {
          return next();
        }
        if (!stat.isFile()) return next();

        const ext = path.extname(filePath).toLowerCase();
        const mime =
          ext === '.mjs' || ext === '.js'
            ? 'application/javascript'
            : ext === '.wasm'
              ? 'application/wasm'
              : 'application/octet-stream';

        res.statusCode = 200;
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', String(stat.size));
        // Manter COOP/COEP em paridade com o resto da app
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveOnnxPublicFiles()],
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    // Em dev, encaminha /api/* para o backend Express (mesma origem),
    // espelhando o proxy de scripts/serve-web.cjs em produção.
    proxy: {
      '/api': {
        target: import.meta.env?.VITE_API_URL || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});