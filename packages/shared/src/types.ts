// packages/shared/src/types.ts (owner: Dev A)
// Contract: docs/PLAN.md section 11. FROZEN at CONTRACT FREEZE (hour 1.5).
// Change requests go to Dev A with the exact diff and the reason. Never edit casually.

import { ATTRIBUTE_ALLOWLIST, STYLE_ALLOWLIST } from './constants.js';
import type { ApiError } from './errors.js';

export type { ApiError };

// ---------------------------------------------------------------------------
// 11.1 Identity, projects, users
// ---------------------------------------------------------------------------

export type Id = string; // nanoid(12) with prefix: usr_ prj_ pat_ rev_ prv_ snp_ rel_ dep_ ver_ drf_ aud_
export type IsoTime = string; // new Date().toISOString()
export type Role = 'developer' | 'reviewer' | 'release_manager';

export interface User {
  id: Id;
  name: string;
  role: Role;
}

export interface Project {
  id: Id;
  name: string;
  upstreamOrigin: string; // must be listed in PW_ALLOWED_UPSTREAMS
  paths: string[]; // tracked paths, e.g. ['/', '/cart', '/checkout']
  liveReleaseId: Id | null;
  createdAt: IsoTime;
}

// ---------------------------------------------------------------------------
// 11.2 Element fingerprint and resolution
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementFingerprint {
  v: 1;
  tag: string; // lower-case
  id: string | null;
  testId: string | null; // data-testid
  name: string | null;
  classes: string[];
  text: string; // normalised visible text, max 200 chars
  accessibleName: string | null; // aria-label | aria-labelledby | label[for] | alt | title
  role: string | null; // explicit or implicit (button, link, textbox...)
  attrs: Record<string, string>; // allowlist: href, src, alt, title, type, placeholder, value
  cssPath: string; // unique selector at capture (prefers id, data-testid)
  xpath: string; // absolute
  ancestors: Array<{ tag: string; id: string | null; classes: string[] }>; // nearest first, max 5
  siblingIndex: number;
  neighborText: string; // prev + next sibling text and parent label, max 200 chars
  rect: Rect | null; // null when captured without layout (jsdom)
  capturedAt: IsoTime;
  capturedFromHash: string; // Snapshot.domHash, or 'runtime'
}

export type ResolutionStatus = 'exact' | 'relocated' | 'ambiguous' | 'not_found';

export interface FeatureEvidence {
  feature: string;
  weight: number;
  similarity: number; // 0..1
}

export interface Resolution {
  anchorId: string;
  status: ResolutionStatus;
  confidence: number; // 0..1 normalised weighted score of best candidate
  margin: number; // best minus runner-up
  elementPath: string | null; // unique CSS path of the match in the resolved document
  evidence: FeatureEvidence[]; // best candidate, sorted by weight x similarity desc
  runnerUp: { elementPath: string; confidence: number } | null;
  mode: 'smart' | 'selector' | 'xpath';
}

// ---------------------------------------------------------------------------
// 11.3 Patch format and lifecycle
// ---------------------------------------------------------------------------

export type TargetRef = { anchor: string }; // key into PatchBody.anchors
export type StyleProperty = (typeof STYLE_ALLOWLIST)[number];
export type AttributeName = (typeof ATTRIBUTE_ALLOWLIST)[number];

export type BehaviorAction =
  | { type: 'navigate'; url: string } // relative or http(s) only
  | { type: 'preventDefault' }
  | { type: 'clickTarget'; target: TargetRef }
  | { type: 'toggleAttribute'; target: TargetRef; name: AttributeName }
  | { type: 'submitForm'; target: TargetRef };

export type PatchOp = // 9 kinds
  | { kind: 'setText'; target: TargetRef; value: string } // <= 2,000 chars
  | { kind: 'setAttribute'; target: TargetRef; name: AttributeName; value: string }
  | { kind: 'removeAttribute'; target: TargetRef; name: AttributeName }
  | { kind: 'setStyle'; target: TargetRef; property: StyleProperty; value: string }
  | { kind: 'hide'; target: TargetRef }
  | { kind: 'show'; target: TargetRef }
  | {
      kind: 'move';
      target: TargetRef;
      reference: TargetRef;
      position: 'before' | 'after' | 'prepend' | 'append';
    }
  | {
      kind: 'insertHTML';
      target: TargetRef;
      position: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';
      html: string; // sanitised, <= 10 KB
    }
  | {
      kind: 'setBehavior';
      target: TargetRef;
      event: 'click' | 'submit';
      mode: 'replace' | 'before';
      action: BehaviorAction;
    };
// Property keys used by conflict detection:
// 'text' | `attr:${name}` | `style:${prop}` | 'visibility' | 'position' | `insert:${position}` | `behavior:${event}`

export interface PatchBody {
  urlPath: string; // '/cart' or prefix glob '/products/*'
  anchors: Record<string, ElementFingerprint>; // 1..10, keys /^[a-z0-9_-]{1,32}$/
  ops: PatchOp[]; // 1..50, applied in order
  checks: VerificationStep[]; // 0..20
  baseSnapshotId: Id | null; // snapshot the author edited against
  baseValues: Record<number, string | null>; // op index -> value before patching
}

export type PatchStatus =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'merged'
  | 'rejected';

export interface Patch extends PatchBody {
  id: Id;
  projectId: Id;
  title: string;
  description: string;
  authorId: Id;
  status: PatchStatus;
  revision: number; // +1 on every save; PUT must send expectedRevision
  mergedRevision: number | null; // revision currently in head
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export interface Review {
  id: Id;
  patchId: Id;
  revision: number;
  reviewerId: Id;
  decision: 'approve' | 'request_changes' | 'comment';
  comment: string;
  createdAt: IsoTime;
}

export interface FrozenPatch extends PatchBody {
  patchId: Id;
  revision: number;
  title: string;
} // carried by releases and previews

// ---------------------------------------------------------------------------
// 11.4 Validation
// ---------------------------------------------------------------------------

export interface Issue {
  code: string;
  message: string;
  path: (string | number)[];
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  issues: Issue[];
  sanitized: PatchBody | null; // non-null if the sanitiser changed HTML
}

// ---------------------------------------------------------------------------
// 11.5 Conflicts
// ---------------------------------------------------------------------------

export type ConflictType =
  | 'SAME_PROPERTY'
  | 'TEXT_OVERWRITES_CHILD'
  | 'EDIT_HIDDEN'
  | 'MOVE_MOVE'
  | 'INSERT_ORDER'
  | 'STALE_BASE'
  | 'AMBIGUOUS_TARGET'
  | 'UNRESOLVED_TARGET';

export interface Conflict {
  id: string; // stable hash of type + patches + element + property
  type: ConflictType;
  severity: 'blocking' | 'warning';
  patchIds: [Id] | [Id, Id]; // candidate first
  elementPath: string | null;
  property: string | null;
  values: { base: string | null; candidate: string | null; existing: string | null } | null;
  message: string;
  resolutions: Array<'candidate_overrides' | 'withdraw_candidate_op' | 'reorder' | 'edit_patch'>;
}

export interface ConflictReport {
  projectId: Id;
  snapshotId: Id;
  checkedAt: IsoTime;
  candidateIds: Id[];
  againstIds: Id[];
  resolutions: Record<Id, Resolution[]>; // per patch
  conflicts: Conflict[];
  blocking: boolean;
}

export interface ConflictResolutionChoice {
  conflictId: string;
  choice: Conflict['resolutions'][number];
  note: string;
}

// ---------------------------------------------------------------------------
// 11.6 Previews and the browser runtime
// ---------------------------------------------------------------------------

export interface PreviewSpec {
  base: 'head' | 'live' | { releaseId: Id };
  include: Id[];
  exclude: Id[];
  draft: (PatchBody & { title: string }) | null;
  resolverMode: 'smart' | 'selector'; // 'selector' = baseline B1, for the demo contrast
}

export interface Preview {
  id: Id;
  projectId: Id;
  spec: PreviewSpec;
  createdBy: Id;
  createdAt: IsoTime;
  expiresAt: IsoTime;
}

export interface RuntimeManifest {
  channel: 'live' | 'preview';
  projectId: Id;
  releaseId: Id | null;
  previewId: Id | null;
  resolverMode: 'smart' | 'selector';
  patches: FrozenPatch[]; // apply order
  editor: { enabled: boolean; allowedOrigin: string | null };
  beaconUrl: '/__patchwork/beacon';
  thresholds: { exact: number; relocate: number; margin: number };
}

export interface RuntimePatchStatus {
  patchId: Id;
  revision: number;
  applied: boolean;
  reason: 'ok' | 'path_mismatch' | 'anchor_ambiguous' | 'anchor_not_found' | 'op_error';
  resolutions: Resolution[];
  affectedRects: Rect[];
  error: string | null;
}

export interface RuntimeStatus {
  ready: boolean;
  manifestHash: string;
  patches: RuntimePatchStatus[];
} // window.__PATCHWORK__.status

export type BeaconEvent =
  | {
      type: 'patch_applied' | 'patch_skipped';
      patchId: Id;
      revision: number;
      reason: RuntimePatchStatus['reason'];
    }
  | { type: 'js_error'; message: string; source: string | null; patchwork: boolean };

export interface BeaconPayload {
  channel: 'live' | 'preview';
  projectId: Id;
  releaseId: Id | null;
  previewId: Id | null;
  path: string;
  events: BeaconEvent[];
}
// Editor bridge (postMessage). Runtime accepts messages only from manifest.editor.allowedOrigin;
// editor accepts messages only from the preview origin (PW_PREVIEW_ORIGIN).

export type EditorToRuntime =
  | { source: 'patchwork-editor'; type: 'pick:start' | 'pick:stop' }
  | { source: 'patchwork-editor'; type: 'highlight'; anchor: ElementFingerprint | null };

export type RuntimeToEditor =
  | { source: 'patchwork-runtime'; type: 'ready'; status: RuntimeStatus; path: string }
  | {
      source: 'patchwork-runtime';
      type: 'picked';
      fingerprint: ElementFingerprint;
      elementPath: string;
      current: { text: string; attrs: Record<string, string>; styles: Record<string, string> };
    };

// ---------------------------------------------------------------------------
// 11.7 Snapshots and verification
// ---------------------------------------------------------------------------

export interface Snapshot {
  id: Id;
  projectId: Id;
  path: string;
  domHash: string;
  html: string;
  boxes: Record<string, Rect>; // keyed by elementPath, visible elements only
  capturedAt: IsoTime;
}

export type VerificationStep =
  | { action: 'goto'; path: string }
  | { action: 'click'; target: string } // CSS selector, or 'anchor:<key>' resolved by the runtime
  | { action: 'fill'; target: string; value: string }
  | { action: 'expectText'; target: string; contains: string }
  | { action: 'expectVisible'; target: string }
  | { action: 'expectHidden'; target: string }
  | { action: 'expectUrl'; contains: string };

export interface StepResult {
  patchId: Id | null;
  index: number;
  step: VerificationStep;
  ok: boolean;
  error: string | null;
  screenshot: string | null;
  durationMs: number;
}

export interface VisualResult {
  path: string;
  baseline: string;
  candidate: string;
  diff: string; // artifact file names
  diffPixels: number;
  totalPixels: number;
  outsideMaskRatio: number;
  layoutChanging: boolean;
  outcome: 'pass' | 'warn' | 'fail';
}

export type VerificationSubject =
  | { kind: 'preview'; previewId: Id }
  | { kind: 'release'; releaseId: Id }
  | { kind: 'live' };

export interface VerificationRun {
  id: Id;
  projectId: Id;
  subject: VerificationSubject;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'error';
  startedAt: IsoTime;
  finishedAt: IsoTime | null;
  patchApplication: RuntimePatchStatus[];
  steps: StepResult[];
  visual: VisualResult[];
  newConsoleErrors: string[];
  summary: string;
}

// ---------------------------------------------------------------------------
// 11.8 Releases, deployments, rollback
// ---------------------------------------------------------------------------

export type ReleaseStatus =
  | 'candidate'
  | 'verifying'
  | 'verified'
  | 'verification_failed'
  | 'live'
  | 'superseded'
  | 'rolled_back';

export interface Release {
  id: Id;
  projectId: Id;
  number: number; // R1, R2...
  patches: FrozenPatch[]; // immutable after creation
  manifestHash: string; // sha256 of canonical JSON of patches
  status: ReleaseStatus;
  parentReleaseId: Id | null;
  origin: 'head' | 'quarantine' | 'manual';
  note: string;
  createdBy: Id;
  createdAt: IsoTime;
  verificationRunId: Id | null;
}

export type DeploymentKind = 'deploy' | 'force_deploy' | 'rollback' | 'auto_rollback';

export interface Deployment {
  id: Id;
  projectId: Id;
  releaseId: Id;
  previousReleaseId: Id | null; // rollback metadata
  kind: DeploymentKind;
  status: 'in_progress' | 'healthy' | 'failed' | 'rolled_back';
  reason: string;
  actorId: Id | 'system';
  startedAt: IsoTime;
  endedAt: IsoTime | null;
  healthRunId: Id | null;
}

// ---------------------------------------------------------------------------
// 11.9 Drift and benchmark
// ---------------------------------------------------------------------------

export type PatchHealth = 'healthy' | 'healed' | 'at_risk' | 'broken';

export interface AssistSuggestion {
  anchorId: string;
  provider: 'ollama' | 'openrouter';
  model: string;
  choice: string | null; // elementPath of the suggested candidate, or null = "none of these"
  reason: string; // <= 300 chars, shown to the reviewer
  latencyMs: number;
}

export interface DriftPatchResult {
  patchId: Id;
  revision: number;
  health: PatchHealth;
  resolutions: Resolution[];
  proposedFingerprints: Record<string, ElementFingerprint> | null;
  assist: AssistSuggestion[]; // empty unless PW_ASSIST_PROVIDER is set and an anchor was ambiguous
}

export interface DriftReport {
  id: Id;
  projectId: Id;
  releaseId: Id;
  path: string;
  previousSnapshotId: Id | null;
  snapshotId: Id;
  createdAt: IsoTime;
  results: DriftPatchResult[];
  quarantineReleaseId: Id | null;
}

export interface BenchRow {
  method:
    | 'patchwork'
    | 'patchwork_llm'
    | 'css_selector'
    | 'xpath'
    | 'best_match_no_threshold';
  set: 'dev' | 'heldout';
  cases: number;
  reanchorRate: number;
  wrongTargetRate: number;
  correctAbstainRate: number;
}

// ---------------------------------------------------------------------------
// 11.10 Audit trail
// ---------------------------------------------------------------------------

export type AuditType =
  | 'patch.created'
  | 'patch.updated'
  | 'patch.submitted'
  | 'patch.reviewed'
  | 'patch.merged'
  | 'patch.rejected'
  | 'conflict.detected'
  | 'conflict.resolved'
  | 'preview.created'
  | 'verification.finished'
  | 'release.created'
  | 'release.deployed'
  | 'release.force_deployed'
  | 'deployment.healthy'
  | 'deployment.failed'
  | 'release.rolled_back'
  | 'release.auto_rolled_back'
  | 'drift.detected'
  | 'patch.heal_proposed'
  | 'release.quarantine_proposed';

export interface AuditEvent {
  seq: number;
  id: Id;
  projectId: Id;
  type: AuditType;
  actorId: Id | 'system';
  subject: { type: 'patch' | 'release' | 'deployment' | 'preview' | 'verification' | 'drift'; id: Id };
  data: Record<string, unknown>;
  prevHash: string;
  hash: string;
  createdAt: IsoTime;
}
// hash = sha256hex(prevHash + '\n' + canonicalJson({seq,id,projectId,type,actorId,subject,data,createdAt}))
// first prevHash = '0'.repeat(64); events are only ever INSERTed.
// (ErrorCode and ApiError live in errors.ts and are re-exported by index.ts.)
