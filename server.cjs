#!/usr/bin/env node
/**
 * Minimal static file server for BIMDesign.
 * Serves the app over localhost so browser ES modules work.
 *
 * Usage:  node server.cjs   (or double-click serve.bat on Windows)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.bdp': 'application/octet-stream',
  '.ifc': 'application/octet-stream',
  '.dxf': 'application/dxf',
  '.obj': 'text/plain',
  '.glb': 'model/gltf-binary',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
};

const PUBLIC_DIR = path.join(ROOT, 'public');

function tryFile(filePath, res, fallback) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return fallback();
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    fs.readFile(filePath, (e3, data) => {
      if (e3) {
        res.writeHead(500);
        return res.end('Erro ao ler arquivo.');
      }
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Prevent directory traversal
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const rootFile = path.join(ROOT, safePath);
  const publicFile = path.join(PUBLIC_DIR, safePath);

  if (!rootFile.startsWith(ROOT) && !publicFile.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Acesso negado.');
  }

  // Serve from project root first, then public/ (Vite-style), then SPA fallback
  tryFile(rootFile, res, () =>
    tryFile(publicFile, res, () => {
      // SPA fallback: serve index.html for unknown routes
      const fallback = path.join(ROOT, 'index.html');
      fs.readFile(fallback, (e2, data) => {
        if (e2) {
          res.writeHead(404);
          return res.end('Arquivo não encontrado.');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    }),
  );
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Porta ${PORT} já está em uso. Outro servidor já está rodando?\n  Tente abrir http://localhost:${PORT} no navegador.\n`);
  } else {
    console.error('Erro no servidor:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n  BIMDesign  →  http://localhost:${PORT}\n`);
  console.log('  Pressione Ctrl+C para parar o servidor.\n');
});
