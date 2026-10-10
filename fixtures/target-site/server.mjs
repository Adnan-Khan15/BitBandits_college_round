// OWNER: Dev D - replace this stub (docs/PLAN.md section 13.6, Part 1).
// ShopLite: the demo "upstream" website with a real bug and a redesigned v2.
// Plain Node http, no dependencies, offline. Serves v1/ or v2/ (in-memory switch, default v1).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PW_TARGET_PORT ?? '4200', 10);

let version = 'v1'; // in-memory switch; Dev D adds GET/POST /__upstream/version

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);

  if (url.pathname === '/__upstream/version') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ version }));
    return;
  }

  // Static files from <version>/, one level deep; anything else -> index.html.
  const rel = normalize(url.pathname).replace(/^([/\\])+/, '');
  const file = join(here, version, rel === '' ? 'index.html' : rel);
  try {
    const body = await readFile(file);
    const type = file.endsWith('.css')
      ? 'text/css'
      : file.endsWith('.js')
        ? 'text/javascript'
        : 'text/html';
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
    res.end(body);
  } catch {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<h1>ShopLite placeholder</h1><p>v1/v2 pages arrive with Dev D.</p>');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[target] ShopLite (${version}) on http://localhost:${port}`);
});
