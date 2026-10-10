// packages/shared/src/services.ts (owner: Dev A)
// Contract: docs/PLAN.md section 11.13.
// main.ts builds one ServiceRegistry; modules receive it, never import each other's files.

import type {
  AuditEvent,
  AuditType,
  BeaconPayload,
  BenchRow,
  DriftReport,
  DriftPatchResult,
  ElementFingerprint,
  FrozenPatch,
  Id,
  IsoTime,
  Patch,
  Preview,
  PreviewSpec,
  Project,
  Release,
  RuntimeManifest,
  Snapshot,
  VerificationRun,
  VerificationSubject,
  Deployment,
} from './types.js';

export interface AuditService {
  append(e: Omit<AuditEvent, 'seq' | 'id' | 'prevHash' | 'hash' | 'createdAt'>): AuditEvent;
  list(projectId: Id, opts?: { type?: AuditType; limit?: number }): AuditEvent[];
  verifyChain(projectId: Id): { valid: boolean; brokenAtSeq: number | null };
}

export interface CoreService {
  getProject(id: Id): Project | null;
  getPatch(id: Id): Patch | null;
  listHead(projectId: Id): FrozenPatch[]; // merged revisions, merge order
  createPreview(projectId: Id, spec: PreviewSpec, actorId: Id): Preview;
  getPreview(id: Id): Preview | null;
  manifestForPreview(previewId: Id): RuntimeManifest;
  // Drift heal: new revision of a merged patch with refreshed anchors, status 'in_review', audited
  proposeHeal(
    patchId: Id,
    anchors: Record<string, ElementFingerprint>,
    actorId: Id | 'system',
    note: string,
  ): Patch;
}

export interface SnapshotService {
  capture(projectId: Id, path: string): Promise<Snapshot>;
  latest(projectId: Id, path: string): Snapshot | null;
  get(id: Id): Snapshot | null;
}

export interface VerifyService {
  start(projectId: Id, subject: VerificationSubject, actorId: Id): VerificationRun; // returns queued; runs async
  runToCompletion(
    projectId: Id,
    subject: VerificationSubject,
    actorId: Id,
  ): Promise<VerificationRun>;
  get(id: Id): VerificationRun | null;
}

export interface ReleaseService {
  create(
    projectId: Id,
    input: { origin: Release['origin']; patches?: FrozenPatch[]; note: string },
    actorId: Id,
  ): Release;
  get(id: Id): Release | null;
  list(projectId: Id): Release[];
  live(projectId: Id): Release | null;
  manifestForLive(projectId: Id): RuntimeManifest;
  deploy(releaseId: Id, actorId: Id, opts: { force: boolean; reason: string }): Promise<Deployment>;
  rollback(
    projectId: Id,
    toReleaseId: Id | null,
    actorId: Id,
    reason: string,
  ): Promise<Deployment>;
  recordBeacon(p: BeaconPayload): void;
}

export interface DriftService {
  check(projectId: Id, actorId: Id | 'system'): Promise<DriftReport[]>;
  list(projectId: Id): DriftReport[];
  proposeQuarantine(reportId: Id, actorId: Id): Promise<Release>;
  bench(): BenchRow[];
}

export interface ServiceRegistry {
  audit: AuditService;
  core: CoreService;
  snapshots: SnapshotService;
  verify: VerifyService;
  releases: ReleaseService;
  drift: DriftService;
}

// Convenience alias so route files can type their factory params consistently.
export type ServiceFactory<T> = (registry: ServiceRegistry, db: unknown) => T;

// Re-exported for convenience: the types services deal with daily.
export type {
  AuditEvent,
  AuditType,
  BeaconPayload,
  BenchRow,
  Deployment,
  DriftPatchResult,
  DriftReport,
  FrozenPatch,
  Id,
  IsoTime,
  Patch,
  Preview,
  PreviewSpec,
  Project,
  Release,
  RuntimeManifest,
  Snapshot,
  VerificationRun,
  VerificationSubject,
};
