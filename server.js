// Local-dev static file server (ESM). Prefer static hosting for production.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname);

const PORT = 0;
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.csv':  'text/csv',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map':  'application/json',
};

function resolveSafePath(urlPath) {
  // Strip query/hash; decode once; reject null bytes.
  let raw = urlPath.split('?')[0].split('#')[0];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (raw.includes('\0')) return null;
  if (raw === '/' || raw === '') return path.join(ROOT, 'index.html');

  // Normalize to a path under ROOT. path.normalize collapses .. segments.
  const rel = raw.replace(/^\/+/, '');
  const candidate = path.resolve(ROOT, rel);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (candidate !== ROOT && !candidate.startsWith(rootWithSep)) {
    return null;
  }
  return candidate;
}

export function createServer() {
  return http.createServer((req, res) => {
    const filePath = resolveSafePath(req.url || '/');
    if (!filePath) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

// Allow importing createServer / resolveSafePath from tests without listening.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const server = createServer();
  server.listen(PORT, () => {
    const assigned = server.address().port;
    console.log(`HELIOS server running at http://localhost:${assigned}`);
  });
}

export { resolveSafePath, ROOT };
