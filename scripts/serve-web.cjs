const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'dist');
const port = process.env.PORT || 8081;
const host = process.env.HOST || '0.0.0.0';
const apiPort = process.env.API_PORT || 3000;
const apiHost = process.env.API_HOST || '127.0.0.1';

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.onnx': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

function setCommonHeaders(res) {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

// Encaminha /api/* para o backend Express (mesma origem para o app).
function proxyApi(req, res) {
  const proxyReq = http.request(
    {
      host: apiHost,
      port: apiPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `${apiHost}:${apiPort}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: `Backend indisponível em ${apiHost}:${apiPort} (${err.message}). Rode "npm run server".`,
      }),
    );
  });

  req.pipe(proxyReq);
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }

  let filePath = url === '/' ? path.join(root, 'index.html') : path.join(root, url);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(root, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = mime[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', type);
    setCommonHeaders(res);
    // SW e HTML sempre revalidados: senão atualizações do PWA ficam presas no cache.
    if (url === '/sw.js' || ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    }
    res.end(data);
  });
}).listen(port, host, () => {
  console.log(`PocketRAG web disponível em http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`API encaminhada de /api/* para http://${apiHost}:${apiPort}`);
  console.log(`Acesse pelo celular: http://<IP-DO-PC>:${port}`);
});