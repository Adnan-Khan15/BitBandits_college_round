// apps/server/src/snapshots/index.ts (owner: Dev C) - PLAN 11.7, solo deviation 6.2.
// ShopLite is static HTML, so a snapshot is a direct fetch of the upstream page (not the gateway):
// html = response text, domHash = sha256 of whitespace-collapsed HTML, boxes = {} (no layout).
// The resolver treats a missing rect as "feature absent", so conflicts and drift still work.
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { chromium, type Browser } from 'playwright';
import { nanoid } from 'nanoid';
import { AppError, snapshotRequestSchema } from '@patchwork/shared';
import type { Rect, ServiceRegistry, Snapshot, SnapshotService } from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';

interface SnapshotRow {
  id: string;
  project_id: string;
  path: string;
  dom_hash: string;
  html: string;
  boxes_json: string;
  captured_at: string;
}

function rowToSnapshot(r: SnapshotRow): Snapshot {
  return {
    id: r.id,
    projectId: r.project_id,
    path: r.path,
    domHash: r.dom_hash,
    html: r.html,
    boxes: JSON.parse(r.boxes_json) as Record<string, Rect>,
    capturedAt: r.captured_at,
  };
}

/**
 * A page built by JavaScript (React, Vue, a Vite or Next dev server...) arrives as an almost empty
 * shell plus scripts. Those pages are rendered in headless Chromium so the AI, the conflict check
 * and Drift Sentinel see the same elements a visitor does. Server-rendered pages skip the browser.
 */
export function needsRendering(html: string): boolean {
  if (!/<script\b/i.test(html)) return false;
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const visible = body
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return visible.length < 200;
}

let browserPromise: Promise<Browser> | null = null;

async function renderInBrowser(url: string): Promise<string | null> {
  try {
    browserPromise ??= chromium.launch();
    const browser = await browserPromise;
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
      return await page.content();
    } finally {
      await context.close();
    }
  } catch {
    browserPromise = null;
    return null; // keep the fetched HTML: an unrendered snapshot is still better than none
  }
}

export const domHashOf = (html: string): string =>
  createHash('sha256').update(html.replace(/\s+/g, ' ').trim()).digest('hex');

export function createSnapshotService(db: Db): SnapshotService {
  return {
    async capture(projectId, path): Promise<Snapshot> {
      if (!path.startsWith('/') || path.startsWith('//')) {
        throw new AppError('VALIDATION_FAILED', `Snapshot path must be origin-relative, got "${path}"`);
      }
      const project = db.prepare('SELECT upstream_origin FROM projects WHERE id = ?').get(projectId) as
        | { upstream_origin: string }
        | undefined;
      if (!project) throw new AppError('NOT_FOUND', `No project ${projectId}`);
      const url = new URL(path, project.upstream_origin);
      let html: string;
      try {
        const res = await fetch(url, { headers: { 'accept-encoding': 'identity' }, redirect: 'follow' });
        if (!res.ok) throw new AppError('UPSTREAM_UNREACHABLE', `Upstream answered ${res.status} for ${url.href}`);
        html = await res.text();
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError('UPSTREAM_UNREACHABLE', `Upstream ${project.upstream_origin} is unreachable`);
      }
      if (needsRendering(html)) html = (await renderInBrowser(url.href)) ?? html;
      const snapshot: Snapshot = {
        id: `snp_${nanoid(12)}`,
        projectId,
        path,
        domHash: domHashOf(html),
        html,
        boxes: {},
        capturedAt: new Date().toISOString(),
      };
      db.prepare(
        `INSERT INTO snapshots (id, project_id, path, dom_hash, html, boxes_json, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(snapshot.id, projectId, path, snapshot.domHash, html, '{}', snapshot.capturedAt);
      return snapshot;
    },

    latest(projectId, path): Snapshot | null {
      const row = db
        .prepare(
          'SELECT * FROM snapshots WHERE project_id = ? AND path = ? ORDER BY captured_at DESC, rowid DESC LIMIT 1',
        )
        .get(projectId, path) as unknown as SnapshotRow | undefined;
      return row ? rowToSnapshot(row) : null;
    },

    get(id): Snapshot | null {
      const row = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as unknown as
        | SnapshotRow
        | undefined;
      return row ? rowToSnapshot(row) : null;
    },
  };
}

export function registerSnapshotRoutes(app: FastifyInstance, registry: ServiceRegistry): void {
  app.post('/api/projects/:pid/snapshots', async (req) => {
    const { pid } = req.params as { pid: string };
    const { path } = snapshotRequestSchema.parse(req.body);
    const { html: _html, ...rest } = await registry.snapshots.capture(pid, path);
    return rest; // PLAN 11.12: Snapshot with html omitted
  });
}
