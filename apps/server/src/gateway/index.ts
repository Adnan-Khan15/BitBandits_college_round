// apps/server/src/gateway/index.ts (owner: Dev C) - PLAN 11.12 tail, 13.5 step 1.
// registerGatewayRoutes(app, registry, channel): serves ONE project (PW_PROJECT_ID).
// Live (:4100) serves only the active release and never reads the preview cookie;
// preview (:4300) serves whatever the pw_preview cookie selects and NEVER falls back to live.
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError, beaconPayloadSchema, isAppError, LIMITS } from '@patchwork/shared';
import type { ServiceRegistry } from '@patchwork/shared';
import { loadEnv, type Env } from '../env.js';
import { getActiveProjectId } from '../active.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const RUNTIME_FILE = join(repoRoot, 'packages', 'runtime', 'dist', 'patchwork-runtime.js');

export const PREVIEW_COOKIE = 'pw_preview';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
// Never forwarded upstream: Host is the upstream's own, the body length/encoding are recomputed.
const DROP_REQUEST = new Set(['host', 'content-length', 'accept-encoding']);
// Never copied back: fetch already decoded the body, and we recompute its length.
const DROP_RESPONSE = new Set(['content-length', 'content-encoding']);

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name) out[name] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/** Cookie header minus pw_preview, or null when nothing is left. */
function stripPreviewCookie(header: string): string | null {
  const kept = header
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p !== '' && !p.startsWith(`${PREVIEW_COOKIE}=`));
  return kept.length > 0 ? kept.join('; ') : null;
}

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Inserts the runtime script before </head>, else right after <body ...>, else at the start. */
export function injectRuntime(html: string, projectId: string, channel: 'live' | 'preview'): string {
  const tag = `<script src="/__patchwork/runtime.js" data-pw-project="${escapeAttr(projectId)}" data-pw-channel="${channel}"></script>`;
  const head = html.search(/<\/head\s*>/i);
  if (head !== -1) return html.slice(0, head) + tag + html.slice(head);
  const body = /<body[^>]*>/i.exec(html);
  if (body) {
    const at = body.index + body[0].length;
    return html.slice(0, at) + tag + html.slice(at);
  }
  return tag + html;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Absolute links to the upstream (href/src/action) become relative, so clicks and assets stay
 * inside the gateway instead of jumping to the real site.
 */
export function rewriteUpstreamUrls(html: string, origin: string): string {
  const host = escapeRe(new URL(origin).host);
  const re = new RegExp(`(\\b(?:href|src|action)\\s*=\\s*)(["'])(?:https?:)?//${host}(?=[/"'?#])/?`, 'gi');
  return html.replace(re, (_m, attr: string, quote: string) => `${attr}${quote}/`);
}

/**
 * Lets the PATCHWORK runtime run and the page render inside the Studio frame: drops frame-ancestors
 * and adds 'self' where scripts or fetches are restricted. A policy using 'strict-dynamic' would still
 * block a plain script tag, so it is removed instead. Returns null to remove the header.
 */
export function adjustCsp(csp: string): { value: string | null; how: 'adjusted' | 'removed' | 'unchanged' } {
  const original = csp
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  const kept = original.filter((d) => !/^frame-ancestors\b/i.test(d));
  if (kept.some((d) => /^script-src(-elem)?\b/i.test(d) && /'strict-dynamic'/i.test(d))) {
    return { value: null, how: 'removed' };
  }
  const names = kept.map((d) => d.split(/\s+/)[0]!.toLowerCase());
  const needsSelf = new Set(['script-src', 'script-src-elem', 'connect-src']);
  if (!names.includes('script-src') && !names.includes('script-src-elem')) needsSelf.add('default-src');
  let changed = kept.length !== original.length;
  const out = kept.map((d) => {
    const [name, ...sources] = d.split(/\s+/);
    if (!needsSelf.has(name!.toLowerCase())) return d;
    if (sources.includes("'self'") || sources.includes('*')) return d;
    changed = true;
    return [name, ...sources.filter((x) => x !== "'none'"), "'self'"].join(' ');
  });
  if (!changed) return { value: csp, how: 'unchanged' };
  return out.length > 0 ? { value: out.join('; '), how: 'adjusted' } : { value: null, how: 'adjusted' };
}

/** Only origin-relative paths ("/x", not "//host/x" or "\\host"). */
export function isSafeRelativePath(p: string): boolean {
  return p.startsWith('/') && !p.startsWith('//') && !p.includes('\\');
}

const normOrigin = (u: string): string | null => {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
};

export function registerGatewayRoutes(
  app: FastifyInstance,
  registry: ServiceRegistry,
  channel: 'live' | 'preview',
  env: Env = loadEnv(),
): void {
  // the site selected in the UI (data/active-project.json), PW_PROJECT_ID by default
  const activeId = (): string => getActiveProjectId();
  const activeIdDefault = env.PW_PROJECT_ID;
  const allowed = new Set(env.PW_ALLOWED_UPSTREAMS.map(normOrigin).filter((o): o is string => o !== null));

  /**
   * The active site's upstream. Allowed hosts: PW_ALLOWED_UPSTREAMS, or the origin of a site a release
   * manager connected (a project row). The gateway never fetches any other host.
   */
  const upstreamOrigin = (): string => {
    const project = registry.core.getProject(activeId());
    if (!project) throw new AppError('NOT_FOUND', `The active site ${activeId()} does not exist`);
    const origin = normOrigin(project.upstreamOrigin);
    // The project row is the allowlist entry for a connected site (POST /api/projects validated it);
    // seeded sites must also be in PW_ALLOWED_UPSTREAMS. No request ever picks the host.
    const connectedSite = project.id !== activeIdDefault || allowed.has(origin ?? '');
    if (!origin || !connectedSite) {
      throw new AppError('FORBIDDEN', `Upstream ${project.upstreamOrigin} is not allowed`);
    }
    return origin;
  };

  const previewIdFrom = (req: FastifyRequest): string | null =>
    parseCookies(req.headers.cookie)[PREVIEW_COOKIE] ?? null;

  app.setErrorHandler((err, req, reply) => {
    const requestId = String(req.id);
    if (isAppError(err)) return reply.status(err.httpStatus).send(err.toApiError(requestId));
    req.log.error(err);
    return reply.status(500).send(new AppError('INTERNAL', 'Gateway error').toApiError(requestId));
  });

  // Every body arrives as a raw Buffer: the proxy forwards bytes untouched, the beacon parses JSON itself.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.get('/__patchwork/runtime.js', async (_req, reply) => {
    let js: Buffer;
    try {
      js = await readFile(RUNTIME_FILE);
    } catch {
      return reply
        .status(503)
        .type('text/plain; charset=utf-8')
        .send('PATCHWORK runtime is not built. Run: npm run build:runtime');
    }
    return reply
      .header('cache-control', 'no-store')
      .type('text/javascript; charset=utf-8')
      .send(js);
  });

  app.get('/__patchwork/manifest.json', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (channel === 'live') return registry.releases.manifestForLive(activeId());
    const previewId = previewIdFrom(req);
    if (!previewId) {
      throw new AppError('NOT_FOUND', 'No preview selected (missing pw_preview cookie)');
    }
    const preview = registry.core.getPreview(previewId);
    if (!preview || preview.projectId !== activeId()) {
      throw new AppError('NOT_FOUND', `No preview ${previewId} for the active site`);
    }
    return registry.core.manifestForPreview(previewId);
  });

  if (channel === 'preview') {
    app.get('/__patchwork/preview/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const { path } = req.query as { path?: string; editor?: string };
      const preview = registry.core.getPreview(id);
      if (!preview || preview.projectId !== activeId() || Date.parse(preview.expiresAt) <= Date.now()) {
        return reply
          .status(404)
          .type('text/html; charset=utf-8')
          .send(`<!doctype html><title>Preview not found</title><h1>Preview ${escapeAttr(id)} not found or expired</h1>`);
      }
      const target = path && isSafeRelativePath(path) ? path : '/';
      return reply
        .header('set-cookie', `${PREVIEW_COOKIE}=${encodeURIComponent(id)}; HttpOnly; SameSite=Lax; Path=/`)
        .header('cache-control', 'no-store')
        .redirect(target, 302);
    });
  }

  app.post(
    '/__patchwork/beacon',
    { bodyLimit: LIMITS.beaconPayloadMaxBytes },
    async (req, reply) => {
      const raw = req.body;
      let json: unknown;
      try {
        json = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? ''));
      } catch {
        throw new AppError('VALIDATION_FAILED', 'Beacon body is not JSON');
      }
      const parsed = beaconPayloadSchema.safeParse(json);
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', 'Beacon payload failed validation', parsed.error.issues);
      }
      if (parsed.data.projectId !== activeId()) {
        throw new AppError('VALIDATION_FAILED', `Beacon for project ${parsed.data.projectId} sent to ${activeId()}`);
      }
      // The port decides the channel; a page cannot claim to be live from the preview port.
      registry.releases.recordBeacon({ ...parsed.data, channel });
      return reply.status(204).send();
    },
  );

  // Any other /__patchwork/* path is ours, never the upstream's.
  app.all('/__patchwork/*', async (req) => {
    throw new AppError('NOT_FOUND', `No gateway route ${req.method} ${req.url} on the ${channel} port`);
  });

  const proxy = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    const rawUrl = req.raw.url ?? '/';
    if (!isSafeRelativePath(rawUrl)) {
      throw new AppError('VALIDATION_FAILED', 'Request target must be an origin-relative path');
    }
    const origin = upstreamOrigin();
    const target = new URL(rawUrl, origin);
    if (target.origin !== origin) {
      throw new AppError('VALIDATION_FAILED', 'Request target escapes the upstream origin');
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || HOP_BY_HOP.has(name) || DROP_REQUEST.has(name)) continue;
      if (name === 'cookie') {
        const kept = stripPreviewCookie(Array.isArray(value) ? value.join('; ') : value);
        if (kept) headers.set('cookie', kept);
        continue;
      }
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    headers.set('accept-encoding', 'identity');

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && Buffer.isBuffer(req.body);
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: req.method,
        headers,
        body: hasBody ? new Uint8Array(req.body as Buffer) : undefined,
        redirect: 'manual',
      });
    } catch (err) {
      req.log.warn({ err, target: target.href }, 'upstream unreachable');
      return reply
        .status(502)
        .type('text/html; charset=utf-8')
        .send(
          `<!doctype html><title>502 Upstream unreachable</title><h1>502 - upstream ${escapeAttr(origin)} is unreachable</h1>`,
        );
    }

    reply.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if (HOP_BY_HOP.has(name) || DROP_RESPONSE.has(name) || name === 'set-cookie') return;
      // The developer connected this site, so it may render inside the Studio frame.
      if (name === 'x-frame-options') return;
      if (name === 'content-security-policy') {
        const csp = adjustCsp(value);
        if (csp.how !== 'unchanged') reply.header('x-patchwork-csp', csp.how);
        if (csp.value) reply.header(name, csp.value);
        return;
      }
      if (name === 'location') {
        const loc = new URL(value, target);
        reply.header('location', loc.origin === origin ? `${loc.pathname}${loc.search}${loc.hash}` : value);
        return;
      }
      reply.header(name, value);
    });
    const setCookies = upstream.headers.getSetCookie();
    if (setCookies.length > 0) reply.header('set-cookie', setCookies);

    if (req.method === 'HEAD' || upstream.status === 204 || upstream.status === 304) {
      return reply.send();
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    if (contentType.toLowerCase().includes('text/html')) {
      const html = injectRuntime(rewriteUpstreamUrls(await upstream.text(), origin), activeId(), channel);
      const buf = Buffer.from(html, 'utf8');
      return reply.header('content-length', buf.length).send(buf);
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    return reply.header('content-length', buf.length).send(buf);
  };

  app.route({
    method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    url: '/*',
    handler: proxy,
  });
}
