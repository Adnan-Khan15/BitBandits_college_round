// apps/web/src/api.ts (owner: Dev D)
// Typed client for the control plane (PLAN 11.12) built on the frozen contracts
// in @patchwork/shared. Sends the X-Patchwork-User header from the user switcher;
// every non-2xx response becomes an ApiClientError carrying the server's
// ApiError shape (code, message, requestId, details).
import {
  apiPaths,
  isApiError,
  USER_HEADER,
  type ApiError,
  type AuditEvent,
  type ConflictReport,
  type Deployment,
  type DriftReport,
  type Patch,
  type PreviewSpec,
  type Project,
  type Release,
  type Review,
  type User,
  type ValidationResult,
  type VerificationRun,
  type VerificationSubject,
  type ConflictResolutionChoice,
} from '@patchwork/shared';
import { getCurrentUserId } from './user.js';

export type { ApiError };

export type ApiClientErrorCode = ApiError['error']['code'] | 'NETWORK' | 'BAD_RESPONSE';

export class ApiClientError extends Error {
  readonly code: ApiClientErrorCode;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly details: unknown;

  constructor(init: {
    code: ApiClientErrorCode;
    message: string;
    status?: number | null;
    requestId?: string | null;
    details?: unknown;
  }) {
    super(init.message);
    this.name = 'ApiClientError';
    this.code = init.code;
    this.status = init.status ?? null;
    this.requestId = init.requestId ?? null;
    this.details = init.details;
  }
}

export function isApiClientError(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined) headers.set('content-type', 'application/json');
  const userId = getCurrentUserId();
  if (userId) headers.set(USER_HEADER, userId);

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch (cause) {
    throw new ApiClientError({
      code: 'NETWORK',
      message: `Could not reach the control plane at ${path}. Is the server running?`,
      details: cause instanceof Error ? cause.message : undefined,
    });
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    if (isApiError(body)) {
      throw new ApiClientError({
        code: body.error.code,
        message: body.error.message,
        status: res.status,
        requestId: body.error.requestId,
        details: body.error.details,
      });
    }
    throw new ApiClientError({
      code: 'BAD_RESPONSE',
      message: `The server answered ${res.status} ${res.statusText} with a non-JSON body.`,
      status: res.status,
      details: text.slice(0, 200),
    });
  }

  return body as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

/* Every control-plane route of PLAN 11.12. */
export const api = {
  users: () => request<{ items: User[] }>(apiPaths.users()),

  projects: () => request<{ items: Project[] }>(apiPaths.projects()),
  project: (pid: string) => request<Project>(apiPaths.project(pid)),

  patches: (pid: string, status?: string) =>
    request<{ items: Patch[] }>(apiPaths.projectPatches(pid, status)),
  patch: (id: string) => request<Patch>(apiPaths.patch(id)),
  createPatch: (pid: string, body: unknown) => post<Patch>(apiPaths.projectPatches(pid), body),
  updatePatch: (id: string, body: unknown) => put<Patch>(apiPaths.patch(id), body),
  validatePatch: (id: string) => post<ValidationResult>(apiPaths.patchValidate(id)),
  submitPatch: (id: string) => post<Patch>(apiPaths.patchSubmit(id)),
  reviewPatch: (id: string, body: { decision: 'approve' | 'request_changes' | 'comment'; comment: string }) =>
    post<Review>(apiPaths.patchReviews(id), body),
  mergePatch: (id: string, body: { choices: ConflictResolutionChoice[] }) =>
    post<{ patch: Patch; report: ConflictReport }>(apiPaths.patchMerge(id), body),

  conflicts: (pid: string, candidateIds: string[]) =>
    post<ConflictReport>(apiPaths.projectConflicts(pid), { candidateIds }),

  createPreview: (pid: string, spec: PreviewSpec) =>
    post<{ preview: { id: string }; url: string }>(apiPaths.projectPreviews(pid), spec),
  updatePreview: (id: string, spec: PreviewSpec) =>
    put<{ preview: { id: string }; url: string }>(apiPaths.preview(id), spec),

  audit: (pid: string, query?: { type?: string; limit?: number }) =>
    request<{ items: AuditEvent[] }>(apiPaths.projectAudit(pid, query)),
  auditVerify: (pid: string) =>
    request<{ valid: boolean; brokenAtSeq: number | null }>(apiPaths.projectAuditVerify(pid)),

  captureSnapshot: (pid: string, path: string) =>
    post<{ id: string }>(apiPaths.projectSnapshots(pid), { path }),

  releases: (pid: string) => request<{ items: Release[] }>(apiPaths.projectReleases(pid)),
  createRelease: (pid: string, note: string) => post<Release>(apiPaths.projectReleases(pid), { note }),
  verifyRelease: (id: string) => post<VerificationRun>(apiPaths.releaseVerify(id)),
  deployRelease: (id: string, body: { force: boolean; reason: string }) =>
    post<Deployment>(apiPaths.releaseDeploy(id), body),
  rollback: (pid: string, body: { toReleaseId?: string; reason: string }) =>
    post<Deployment>(apiPaths.projectRollback(pid), body),
  deployments: (pid: string) => request<{ items: Deployment[] }>(apiPaths.projectDeployments(pid)),

  runVerification: (pid: string, subject: VerificationSubject) =>
    post<VerificationRun>(apiPaths.projectVerifications(pid), { subject }),
  verification: (id: string) => request<VerificationRun>(apiPaths.verification(id)),
  artifactUrl: (file: string) => apiPaths.artifact(file),

  driftCheck: (pid: string) => post<{ items: DriftReport[] }>(apiPaths.projectDriftCheck(pid)),
  driftReports: (pid: string) => request<{ items: DriftReport[] }>(apiPaths.projectDrift(pid)),
  proposeQuarantine: (reportId: string) => post<Release>(apiPaths.driftQuarantine(reportId)),
  acceptAssist: (reportId: string, body: { patchId: string; anchorId: string }) =>
    post<Patch>(apiPaths.driftAssistAccept(reportId), body),

  bench: () => request<{ items: Array<Record<string, unknown>> }>(apiPaths.bench()),
};
