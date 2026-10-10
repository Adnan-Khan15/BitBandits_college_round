// packages/shared/src/schemas.ts (owner: Dev A)
// Zod schemas for PatchBody (PLAN 11.3) and every request body in the HTTP API (PLAN 11.12).
// The TS interfaces in types.ts are the contract; these schemas enforce them at runtime.
// Semantic rules beyond the schema (javascript: URLs, on* attributes, CSS value filters,
// DOMPurify) live in apps/server/src/core/validate.ts, not here (PLAN 11.4).

import { z } from 'zod';
import {
  ANCHOR_KEY_PATTERN,
  ATTRIBUTE_ALLOWLIST,
  LIMITS,
  STYLE_ALLOWLIST,
} from './constants.js';

// --- shared fragments ------------------------------------------------------

export const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const elementFingerprintSchema = z.object({
  v: z.literal(1),
  tag: z.string(),
  id: z.string().nullable(),
  testId: z.string().nullable(),
  name: z.string().nullable(),
  classes: z.array(z.string()),
  text: z.string().max(LIMITS.fingerprintTextMaxLength),
  accessibleName: z.string().nullable(),
  role: z.string().nullable(),
  attrs: z.record(z.string(), z.string()),
  cssPath: z.string(),
  xpath: z.string(),
  ancestors: z.array(
    z.object({ tag: z.string(), id: z.string().nullable(), classes: z.array(z.string()) }),
  ),
  siblingIndex: z.number(),
  neighborText: z.string().max(LIMITS.fingerprintTextMaxLength),
  rect: rectSchema.nullable(),
  capturedAt: z.string(),
  capturedFromHash: z.string(),
});

export const targetRefSchema = z.object({ anchor: z.string() });

export const behaviorActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), url: z.string() }),
  z.object({ type: z.literal('preventDefault') }),
  z.object({ type: z.literal('clickTarget'), target: targetRefSchema }),
  z.object({
    type: z.literal('toggleAttribute'),
    target: targetRefSchema,
    name: z.enum(ATTRIBUTE_ALLOWLIST),
  }),
  z.object({ type: z.literal('submitForm'), target: targetRefSchema }),
]);

// The 9 op kinds (PLAN 11.3).
export const patchOpSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('setText'),
    target: targetRefSchema,
    value: z.string().max(LIMITS.textMaxLength),
  }),
  z.object({
    kind: z.literal('setAttribute'),
    target: targetRefSchema,
    name: z.enum(ATTRIBUTE_ALLOWLIST),
    value: z.string(),
  }),
  z.object({
    kind: z.literal('removeAttribute'),
    target: targetRefSchema,
    name: z.enum(ATTRIBUTE_ALLOWLIST),
  }),
  z.object({
    kind: z.literal('setStyle'),
    target: targetRefSchema,
    property: z.enum(STYLE_ALLOWLIST),
    value: z.string(),
  }),
  z.object({ kind: z.literal('hide'), target: targetRefSchema }),
  z.object({ kind: z.literal('show'), target: targetRefSchema }),
  z.object({
    kind: z.literal('move'),
    target: targetRefSchema,
    reference: targetRefSchema,
    position: z.enum(['before', 'after', 'prepend', 'append']),
  }),
  z.object({
    kind: z.literal('insertHTML'),
    target: targetRefSchema,
    position: z.enum(['beforebegin', 'afterbegin', 'beforeend', 'afterend']),
    html: z.string().max(LIMITS.htmlMaxLength),
  }),
  z.object({
    kind: z.literal('setBehavior'),
    target: targetRefSchema,
    event: z.enum(['click', 'submit']),
    mode: z.enum(['replace', 'before']),
    action: behaviorActionSchema,
  }),
]);

// VerificationStep (PLAN 11.7).
export const verificationStepSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('goto'), path: z.string() }),
  z.object({ action: z.literal('click'), target: z.string() }),
  z.object({ action: z.literal('fill'), target: z.string(), value: z.string() }),
  z.object({ action: z.literal('expectText'), target: z.string(), contains: z.string() }),
  z.object({ action: z.literal('expectVisible'), target: z.string() }),
  z.object({ action: z.literal('expectHidden'), target: z.string() }),
  z.object({ action: z.literal('expectUrl'), contains: z.string() }),
]);

// --- PatchBody (PLAN 11.3) -------------------------------------------------

export const patchBodySchema = z.object({
  urlPath: z.string(),
  anchors: z.record(z.string().regex(ANCHOR_KEY_PATTERN), elementFingerprintSchema), // 1..10 enforced by core/validate.ts (PLAN 11.4)
  ops: z.array(patchOpSchema).min(LIMITS.opsPerPatch.min).max(LIMITS.opsPerPatch.max),
  checks: z.array(verificationStepSchema).max(LIMITS.checksPerPatch.max),
  baseSnapshotId: z.string().nullable(),
  baseValues: z.record(z.string(), z.string().nullable()),
});

// --- request bodies (PLAN 11.12) -------------------------------------------

/** POST /projects/:pid/patches — { title, description } & PatchBody */
export const createPatchRequestSchema = patchBodySchema.extend({
  title: z.string().min(1),
  description: z.string(),
});

/** PUT /patches/:id — { expectedRevision, title?, description? } & Partial<PatchBody> */
export const updatePatchRequestSchema = z.object({
  expectedRevision: z.number().int(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  urlPath: z.string().optional(),
  anchors: z
    .record(z.string().regex(ANCHOR_KEY_PATTERN), elementFingerprintSchema)
    .optional(), // 1..10 enforced by core/validate.ts (PLAN 11.4)
  ops: z.array(patchOpSchema).min(LIMITS.opsPerPatch.min).max(LIMITS.opsPerPatch.max).optional(),
  checks: z.array(verificationStepSchema).max(LIMITS.checksPerPatch.max).optional(),
  baseSnapshotId: z.string().nullable().optional(),
  baseValues: z.record(z.string(), z.string().nullable()).optional(),
});

/** POST /patches/:id/reviews — { decision, comment } */
export const reviewRequestSchema = z.object({
  decision: z.enum(['approve', 'request_changes', 'comment']),
  comment: z.string(),
});

/** POST /patches/:id/merge — { choices: ConflictResolutionChoice[] } */
export const mergeRequestSchema = z.object({
  choices: z.array(
    z.object({
      conflictId: z.string(),
      choice: z.enum(['candidate_overrides', 'withdraw_candidate_op', 'reorder', 'edit_patch']),
      note: z.string(),
    }),
  ),
});

/** POST /projects/:pid/conflicts — { candidateIds: Id[] } */
export const conflictsRequestSchema = z.object({ candidateIds: z.array(z.string()) });

/** POST|PUT previews — PreviewSpec */
export const previewSpecSchema = z.object({
  base: z.union([
    z.literal('head'),
    z.literal('live'),
    z.object({ releaseId: z.string() }),
  ]),
  include: z.array(z.string()),
  exclude: z.array(z.string()),
  draft: patchBodySchema
    .extend({ title: z.string().min(1) })
    .nullable(),
  resolverMode: z.enum(['smart', 'selector']),
});

/** POST /projects/:pid/snapshots — { path } */
export const snapshotRequestSchema = z.object({ path: z.string() });

/** POST /projects/:pid/releases — { note } (freezes head) */
export const releaseRequestSchema = z.object({ note: z.string() });

/** POST /releases/:id/deploy — { force, reason } */
export const deployRequestSchema = z.object({
  force: z.boolean().default(false),
  reason: z.string().default(''),
});

/** POST /projects/:pid/rollback — { toReleaseId?, reason } */
export const rollbackRequestSchema = z.object({
  toReleaseId: z.string().nullable().optional(),
  reason: z.string(),
});

/** POST /projects/:pid/verifications — { subject } */
export const verificationSubjectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preview'), previewId: z.string() }),
  z.object({ kind: z.literal('release'), releaseId: z.string() }),
  z.object({ kind: z.literal('live') }),
]);
export const verificationRequestSchema = z.object({ subject: verificationSubjectSchema });

/** POST /drift/:id/assist/accept — { patchId, anchorId } */
export const assistAcceptRequestSchema = z.object({
  patchId: z.string(),
  anchorId: z.string(),
});

/** Gateway beacon POST /__patchwork/beacon (PLAN 11.6; max 32 KB, enforced in the gateway). */
export const beaconPayloadSchema = z.object({
  channel: z.enum(['live', 'preview']),
  projectId: z.string(),
  releaseId: z.string().nullable(),
  previewId: z.string().nullable(),
  path: z.string(),
  events: z.array(
    z.discriminatedUnion('type', [
      z.object({
        type: z.enum(['patch_applied', 'patch_skipped']),
        patchId: z.string(),
        revision: z.number().int(),
        reason: z.enum(['ok', 'path_mismatch', 'anchor_ambiguous', 'anchor_not_found', 'op_error']),
      }),
      z.object({
        type: z.literal('js_error'),
        message: z.string(),
        source: z.string().nullable(),
        patchwork: z.boolean(),
      }),
    ]),
  ),
});

// Inferred types (must stay assignable to the interfaces in types.ts).
export type PatchBodyParsed = z.infer<typeof patchBodySchema>;
export type CreatePatchRequest = z.infer<typeof createPatchRequestSchema>;
export type UpdatePatchRequest = z.infer<typeof updatePatchRequestSchema>;
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export type MergeRequest = z.infer<typeof mergeRequestSchema>;
export type ConflictsRequest = z.infer<typeof conflictsRequestSchema>;
export type PreviewSpecParsed = z.infer<typeof previewSpecSchema>;
export type DeployRequest = z.infer<typeof deployRequestSchema>;
export type RollbackRequest = z.infer<typeof rollbackRequestSchema>;
export type VerificationSubjectParsed = z.infer<typeof verificationSubjectSchema>;
export type BeaconPayloadParsed = z.infer<typeof beaconPayloadSchema>;
