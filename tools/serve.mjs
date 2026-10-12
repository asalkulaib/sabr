// Minimal static server that mirrors GitHub Pages: docs/ is served under /sabr/.
// Usage: node tools/serve.mjs [port]   (default 4173)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const port = Number(process.argv[2] || process.env.PORT || 4173);
const BASE = '/sabr/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
};

async function resolveFile(urlPath) {
  const rel = decodeURIComponent(urlPath.slice(BASE.length));
  const file = path.resolve(root, rel);
  if (!file.startsWith(root)) return null;
  try {
    const s = await stat(file);
    if (s.isDirectory()) {
      const index = path.join(file, 'index.html');
      await stat(index);
      return { file: index, redirect: !urlPath.endsWith('/') };
    }
    return { file };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/sabr' || url.pathname === '/') {
    res.writeHead(301, { Location: BASE });
    return res.end();
  }
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  const found = await resolveFile(url.pathname);
  if (!found) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  if (found.redirect) {
    // Like GitHub Pages: /sabr/import -> /sabr/import/ (the browser keeps any #hash)
    res.writeHead(301, { Location: url.pathname + '/' + url.search });
    return res.end();
  }
  const body = await readFile(found.file);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(found.file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
});

server.listen(port, () => console.log(`Sabr is served at http://localhost:${port}${BASE}`));
