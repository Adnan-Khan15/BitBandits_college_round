// OWNER: Dev A - scaffold stub, replaced in Phase 2 step 11 (docs/PLAN.md section 13.3).
// The audit chain (PLAN 11.10) lands here: SHA-256 hash chain, append-only, verifyChain.
import type { AuditEvent, AuditService, Id, AuditType } from '@patchwork/shared';
import { AppError } from '@patchwork/shared';

const notImplemented = (fn: string): never => {
  throw new AppError('NOT_IMPLEMENTED', `audit.${fn} arrives in Phase 2 step 11 (owner: Dev A)`);
};

export function createAuditService(): AuditService {
  return {
    append: (_e: Omit<AuditEvent, 'seq' | 'id' | 'prevHash' | 'hash' | 'createdAt'>): AuditEvent =>
      notImplemented('append'),
    list: (_projectId: Id, _opts?: { type?: AuditType; limit?: number }): AuditEvent[] =>
      notImplemented('list'),
    verifyChain: (_projectId: Id): { valid: boolean; brokenAtSeq: number | null } =>
      notImplemented('verifyChain'),
  };
}
