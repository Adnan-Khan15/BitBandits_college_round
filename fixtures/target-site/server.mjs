#!/usr/bin/env node
/**
 * ShopLite - PATCHWORK demo upstream (Dev D fixture).
 *
 * Zero-dependency Node http server that stands in for "the original app we may
 * never rebuild". It serves v1 (shipped) and v2 (the redeploy that invalidates
 * PATCHWORK's live patches). Accessed through the PATCHWORK gateways on :4100
 * and :4300, and directly on :4200 for drift snapshots.
 *
 * Routes (active version):
 *   /                 -> index.html     (home: promo banner + price typo)
 *   /cart             -> cart.html      (broken checkout button)
 *   /checkout         -> checkout.html  (name/address form)
 *   /order/success    -> success.html
 *   /styles.css       -> styles.css
 *   /app.js           -> app.js
 *   GET|POST /__upstream/version {"version":"v1"|"v2"}   (CORS on this route only)
 *
 * No external fonts, images or CDNs: the demo must work offline.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.PW_TARGET_HOST ?? '127.0.0.1';
const PORT = Number(process.env.PW_TARGET_PORT ?? 4200);
const VERSION_ENDPOINT = '/__upstream/version';

/** In-memory version switch; the server restarts on v1. */
let version = 'v1';

const HTML_PAGES = new Map([
  ['/', 'index.html'],
  ['/cart', 'cart.html'],
  ['/checkout', 'checkout.html'],
  ['/order/success', 'success.html'],
]);

const STATIC_FILES = new Map([
  ['/styles.css', 'text/css; charset=utf-8'],
  ['/app.js', 'text/javascript; charset=utf-8'],
]);

const VERSIONS = new Set(['v1', 'v2']);
const CORS_ORIGINS = new Set(['http://localhost:5173', 'http://localhost:4000']);

function sendJson(res, status, body, origin) {
  const payload = JSON.stringify(body);
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  };
  if (origin && CORS_ORIGINS.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(payload);
}

async function sendFile(res, file, contentType) {
  try {
    const body = await readFile(path.join(ROOT, version, file));
    res.writeHead(200, {
      'content-type': contentType,
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const origin = req.headers.origin;

  // --- version switch endpoint (the only CORS-enabled route) -----------------
  if (pathname === VERSION_ENDPOINT) {
    if (req.method === 'OPTIONS') {
      const headers = {
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'content-length': 0,
      };
      if (origin && CORS_ORIGINS.has(origin)) {
        headers['access-control-allow-origin'] = origin;
        headers.vary = 'Origin';
      }
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      sendJson(res, 200, { version }, origin);
      return;
    }

    if (req.method === 'POST') {
      let parsed;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'invalid JSON body' }, origin);
        return;
      }
      const requested = parsed && typeof parsed === 'object' ? parsed.version : null;
      if (!VERSIONS.has(requested)) {
        sendJson(res, 400, { error: `version must be "v1" or "v2"` }, origin);
        return;
      }
      version = requested;
      console.log(`[shoplite] upstream switched to ${version}`);
      sendJson(res, 200, { version }, origin);
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' }, origin);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('405 Method Not Allowed');
    return;
  }

  // --- pages and assets of the active version ---------------------------------
  const page = HTML_PAGES.get(pathname);
  if (page) {
    await sendFile(res, page, 'text/html; charset=utf-8');
    return;
  }

  const staticType = STATIC_FILES.get(pathname);
  if (staticType) {
    await sendFile(res, pathname.slice(1), staticType);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`[shoplite] listening on http://${HOST}:${PORT} (upstream ${version})`);
});
