// apps/server/src/core/previews.ts (owner: Dev A)
// Phase 2 step 14 (PLAN 11.6, 11.12, 13.3): previews and their runtime manifest.
// createPreview stores the PreviewSpec (expires in 2 h). manifestForPreview builds the
// RuntimeManifest the :4300 gateway serves: base patches (head / live / a release), the
// include - exclude selection, and the unsaved draft appended as FrozenPatch 'draft'.
import { nanoid } from 'nanoid';
import { DEFAULT_THRESHOLDS } from '@patchwork/shared';
import type {
  FrozenPatch,
  Id,
  Preview,
  PreviewSpec,
  RuntimeManifest,
  ServiceRegistry,
} from '@patchwork/shared';
import { AppError } from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';

export interface PreviewConfig {
  editorOrigin: string; // allowedOrigin for postMessage to the editor (PLAN 11.6)
  previewOrigin: string; // origin the preview URL is built on
}

/** Mirrors .env.example; tests and scripts rely on these when no .env is present. */
export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  editorOrigin: 'http://localhost:5173',
  previewOrigin: 'http://localhost:4300',
};

const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000; // 2 h (PLAN 11.6)

type PreviewRow = {
  id: string;
  project_id: string;
  spec_json: string;
  created_by: string;
  created_at: string;
  expires_at: string;
};

function rowToPreview(r: PreviewRow): Preview {
  return {
    id: r.id,
    projectId: r.project_id,
    spec: JSON.parse(r.spec_json) as PreviewSpec,
    createdBy: r.created_by,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
}

export function getPreviewRow(db: Db, id: Id): Preview | null {
  const row = db.prepare('SELECT * FROM previews WHERE id = ?').get(id) as PreviewRow | undefined;
  return row ? rowToPreview(row) : null;
}

function expiry(now: Date): string {
  return new Date(now.getTime() + PREVIEW_TTL_MS).toISOString();
}

export function createPreviewRow(
  db: Db,
  registry: ServiceRegistry,
  projectId: Id,
  spec: PreviewSpec,
  actorId: Id,
): Preview {
  if (!registry.core.getProject(projectId)) {
    throw new AppError('NOT_FOUND', `No project ${projectId}`);
  }
  const id = `prv_${nanoid(12)}`;
  const now = new Date();
  db.prepare(
    'INSERT INTO previews (id, project_id, spec_json, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, projectId, JSON.stringify(spec), actorId, now.toISOString(), expiry(now));

  const preview = getPreviewRow(db, id);
  if (!preview) throw new AppError('INTERNAL', `Failed to store preview ${id}`);
  registry.audit.append({
    projectId,
    type: 'preview.created',
    actorId,
    subject: { type: 'preview', id },
    data: {
      base: spec.base,
      include: spec.include,
      exclude: spec.exclude,
      hasDraft: spec.draft !== null,
      resolverMode: spec.resolverMode,
    },
  });
  return preview;
}

/** PUT /previews/:id replaces the spec in place and refreshes the 2 h expiry. */
export function updatePreviewRow(
  db: Db,
  registry: ServiceRegistry,
  id: Id,
  spec: PreviewSpec,
  actorId: Id,
): Preview {
  const existing = getPreviewRow(db, id);
  if (!existing) throw new AppError('NOT_FOUND', `No preview ${id}`);
  const now = new Date();
  db.prepare('UPDATE previews SET spec_json = ?, created_by = ?, expires_at = ? WHERE id = ?').run(
    JSON.stringify(spec),
    actorId,
    expiry(now),
    id,
  );
  registry.audit.append({
    projectId: existing.projectId,
    type: 'preview.created',
    actorId,
    subject: { type: 'preview', id },
    data: { updated: true, base: spec.base, resolverMode: spec.resolverMode },
  });
  const updated = getPreviewRow(db, id);
  if (!updated) throw new AppError('INTERNAL', `Failed to update preview ${id}`);
  return updated;
}

/** `${PW_PREVIEW_ORIGIN}/__patchwork/preview/${id}?path=<first project path>` (step 14). */
export function previewUrl(previewId: Id, firstPath: string, previewOrigin: string): string {
  return `${previewOrigin}/__patchwork/preview/${previewId}?path=${encodeURIComponent(firstPath)}`;
}

function basePatches(
  registry: ServiceRegistry,
  projectId: Id,
  base: PreviewSpec['base'],
): { patches: FrozenPatch[]; releaseId: Id | null } {
  if (base === 'head') {
    return { patches: registry.core.listHead(projectId), releaseId: null };
  }
  if (base === 'live') {
    const live = registry.releases.live(projectId);
    return { patches: live?.patches ?? [], releaseId: live?.id ?? null };
  }
  const release = registry.releases.get(base.releaseId);
  if (!release) throw new AppError('NOT_FOUND', `No release ${base.releaseId}`);
  return { patches: release.patches, releaseId: release.id };
}

export function buildManifest(
  db: Db,
  registry: ServiceRegistry,
  config: PreviewConfig,
  previewId: Id,
): RuntimeManifest {
  const preview = getPreviewRow(db, previewId);
  if (!preview) throw new AppError('NOT_FOUND', `No preview ${previewId}`);
  if (new Date(preview.expiresAt).getTime() < Date.now()) {
    throw new AppError('NOT_FOUND', `Preview ${previewId} expired at ${preview.expiresAt}`);
  }

  const { patches, releaseId } = basePatches(registry, preview.projectId, preview.spec.base);
  const include = new Set(preview.spec.include);
  const exclude = new Set(preview.spec.exclude);
  const ordered = (include.size > 0 ? patches.filter((p) => include.has(p.patchId)) : patches).filter(
    (p) => !exclude.has(p.patchId),
  );
  if (preview.spec.draft) {
    const { title, ...body } = preview.spec.draft;
    ordered.push({ ...body, patchId: 'draft', revision: 0, title });
  }

  return {
    channel: 'preview',
    projectId: preview.projectId,
    releaseId,
    previewId: preview.id,
    resolverMode: preview.spec.resolverMode,
    patches: ordered,
    editor: { enabled: true, allowedOrigin: config.editorOrigin },
    beaconUrl: '/__patchwork/beacon',
    thresholds: { ...DEFAULT_THRESHOLDS },
  };
}
