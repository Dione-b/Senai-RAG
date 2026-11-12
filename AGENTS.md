This is a Vite + React **web app (PWA)** — mobile-first, installable, with offline support. Prioritize mobile-first patterns, performance, and cross-platform browser compatibility. There is no Expo/React Native in this project anymore; do not reintroduce it.

## Stack

- **Frontend**: Vite 7 + React 19 + TypeScript, routed with `react-router-dom` (`BrowserRouter`).
- **Local data**: SQLite compiled to WASM (`@sqlite.org/sqlite-wasm`), persisted in IndexedDB (`src/services/persistence.ts`). The DB lives entirely in the browser.
- **Embeddings**: `@huggingface/transformers` (ONNX/WASM) running in a Web Worker (`src/services/embeddingWorker.ts`), model `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (pt-BR, ~113 MB q8), fully self-hosted from `public/`.
- **Backend**: Express in `server/` (`/api/*`). The static server proxies `/api/*` to it so everything is same-origin.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npm run dev          # Vite dev server (HMR; SW is disabled in dev)
npm run build        # production build → dist/
npm run preview      # preview the build
npm run server       # start the Express API on :3000
npm run web:network  # serve dist/ on 0.0.0.0:8081 and proxy /api/* (LAN/phone access)
npm run test         # vitest run
npm run lint         # eslint .
npm run typecheck    # tsc --noEmit
npm run model:download  # baixa o modelo de embeddings + ORT para public/ (1º setup)
```

Run lint, typecheck, and `npm run build` before declaring any task done.

## Semantic search (embeddings)

- On attach, `addDocument` chunks the text, stores it in SQLite **and vectorizes** each chunk (Float32 in `chunks.embedding` BLOB). If the model is unavailable, it degrades gracefully to lexical search and backfills later (`backfillEmbeddings`).
- `searchRelevantChunks` runs: **1) semantic** — embed the question, cosine over vectorized chunks, `MIN_SIMILARITY` (0.25, in `src/services/vectors.ts`) decides; when vectorized data exists the semantic verdict is final (no lexical fallback, avoiding stopword false positives). **2) lexical** (FTS5/BM25 → LIKE) only when the model or vectors are unavailable.
- Model loading runs in `src/services/embeddingWorker.ts`; config there is critical: `allowLocalModels=true`, `allowRemoteModels=false`, `env.backends.onnx.wasm.wasmPaths` → `/onnx/` (otherwise transformers.js downloads from jsdelivr CDN and breaks offline/COEP).
- After changing the model or search logic, re-tune `MIN_SIMILARITY` using the `[busca semântica]` console.debug line (observed: ~0.56 real match, ~-0.02 irrelevant).

## Navigation & Routing

- Use **react-router-dom** for all navigation. Screens live in `src/pages/`; shared UI in `src/components/`. Keep non-route code outside `src/pages/`.
- The server (`scripts/serve-web.cjs`) falls back to `index.html` for unknown paths, so deep links like `/documents` work on refresh — keep the catch-all `<Route path="*">` redirecting home.
- Docs: https://reactrouter.com/start/framework/installation

## PWA (manifest + hand-written service worker)

- `public/manifest.webmanifest` — install metadata (name, icons, colors). Icons are generated from `assets/icon.png` (1024²) into `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`.
- `public/sw.js` — hand-written, no dependencies. Strategy: navigations network-first with cached shell fallback; same-origin assets cache-first; `/api/*` and cross-origin requests are **never** intercepted (POST included).
- `src/registerSW.ts` registers it — **production only** (`import.meta.env.PROD`); a service worker in dev breaks Vite HMR.
- After changing `public/sw.js`, bump `CACHE_VERSION` so old caches are purged on activate.
- After changing icons or manifest colors, keep `index.html` meta tags (`theme-color`, apple-touch icons) in sync.

## Rules

- **COOP/COEP headers are mandatory** for the WASM SQLite build (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: credentialless`). They are set in `vite.config.ts` (dev) and `scripts/serve-web.cjs` (prod). Any new server or host must set them too, or the app breaks.
- **Never hardcode external CDNs for the model/ORT** — everything must come from same origin so the PWA works offline. `public/models/` and `public/onnx/` are gitignored; regenerate with `npm run model:download`.
- The static server must keep MIME types `.mjs` → `application/javascript` (module scripts are blocked with the wrong MIME) and `.onnx` → `application/octet-stream`.
- There are no `ios/`/`android/` directories and none may be created — this is a web app; native behavior belongs in the manifest and HTML meta tags.
- Same-origin `/api/*` is the default API setup (`src/services/apiService.ts`); only use `VITE_API_URL` when the API is on another origin.
- Prefer minimal dependencies; check what already exists before adding a library.
