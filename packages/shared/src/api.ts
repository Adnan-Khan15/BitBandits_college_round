// packages/shared/src/api.ts (owner: Dev A)
// Contract: docs/PLAN.md sections 11.12 (control-plane routes) and 11.12 tail (gateway routes).
// Path constants plus tiny builders so apps/web and the server never hand-write a path.

export const API_PREFIX = '/api';

// --- control plane (:4000) -------------------------------------------------

export const apiPaths = {
  users: () => `${API_PREFIX}/users`,

  projects: () => `${API_PREFIX}/projects`,
  project: (pid: string) => `${API_PREFIX}/projects/${pid}`,
  projectPatches: (pid: string, status?: string) =>
    status
      ? `${API_PREFIX}/projects/${pid}/patches?status=${encodeURIComponent(status)}`
      : `${API_PREFIX}/projects/${pid}/patches`,

  patch: (id: string) => `${API_PREFIX}/patches/${id}`,
  patchValidate: (id: string) => `${API_PREFIX}/patches/${id}/validate`,
  patchSubmit: (id: string) => `${API_PREFIX}/patches/${id}/submit`,
  patchReviews: (id: string) => `${API_PREFIX}/patches/${id}/reviews`,
  patchMerge: (id: string) => `${API_PREFIX}/patches/${id}/merge`,

  projectConflicts: (pid: string) => `${API_PREFIX}/projects/${pid}/conflicts`,
  projectPreviews: (pid: string) => `${API_PREFIX}/projects/${pid}/previews`,
  preview: (id: string) => `${API_PREFIX}/previews/${id}`,

  projectAudit: (pid: string, query?: { type?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (query?.type) params.set('type', query.type);
    if (query?.limit !== undefined) params.set('limit', String(query.limit));
    const qs = params.toString();
    return qs ? `${API_PREFIX}/projects/${pid}/audit?${qs}` : `${API_PREFIX}/projects/${pid}/audit`;
  },
  projectAuditVerify: (pid: string) => `${API_PREFIX}/projects/${pid}/audit/verify`,

  projectSnapshots: (pid: string) => `${API_PREFIX}/projects/${pid}/snapshots`,

  projectReleases: (pid: string) => `${API_PREFIX}/projects/${pid}/releases`,
  release: (id: string) => `${API_PREFIX}/releases/${id}`,
  releaseVerify: (id: string) => `${API_PREFIX}/releases/${id}/verify`,
  releaseDeploy: (id: string) => `${API_PREFIX}/releases/${id}/deploy`,

  projectRollback: (pid: string) => `${API_PREFIX}/projects/${pid}/rollback`,
  projectDeployments: (pid: string) => `${API_PREFIX}/projects/${pid}/deployments`,

  projectVerifications: (pid: string) => `${API_PREFIX}/projects/${pid}/verifications`,
  verification: (id: string) => `${API_PREFIX}/verifications/${id}`,
  artifact: (file: string) => `${API_PREFIX}/artifacts/${encodeURIComponent(file)}`,

  projectDriftCheck: (pid: string) => `${API_PREFIX}/projects/${pid}/drift/check`,
  projectDrift: (pid: string) => `${API_PREFIX}/projects/${pid}/drift`,
  driftQuarantine: (id: string) => `${API_PREFIX}/drift/${id}/quarantine`,
  driftAssistAccept: (id: string) => `${API_PREFIX}/drift/${id}/assist/accept`,

  bench: () => `${API_PREFIX}/bench`,
} as const;

// --- gateway (:4100 live, :4300 preview) -----------------------------------

export const gatewayPaths = {
  runtimeJs: () => '/__patchwork/runtime.js',
  manifest: () => '/__patchwork/manifest.json',
  beacon: () => '/__patchwork/beacon',
  /** Preview port only: sets the pw_preview cookie then redirects to `path`. */
  previewEntry: (id: string, path: string, editor = false) =>
    `/__patchwork/preview/${id}?path=${encodeURIComponent(path)}${editor ? '&editor=1' : ''}`,
} as const;
