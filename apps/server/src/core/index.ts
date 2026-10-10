// OWNER: Dev A - scaffold stub, replaced in Phase 2 steps 12-15 (docs/PLAN.md section 13.3).
// CoreService (PLAN 11.13): projects, patches, previews, head, proposeHeal.
import type { CoreService } from '@patchwork/shared';
import { AppError } from '@patchwork/shared';

const notImplemented = (fn: string): never => {
  throw new AppError('NOT_IMPLEMENTED', `core.${fn} arrives in Phase 2 (owner: Dev A)`);
};

export function createCoreService(): CoreService {
  return {
    getProject: () => notImplemented('getProject'),
    getPatch: () => notImplemented('getPatch'),
    listHead: () => notImplemented('listHead'),
    createPreview: () => notImplemented('createPreview'),
    getPreview: () => notImplemented('getPreview'),
    manifestForPreview: () => notImplemented('manifestForPreview'),
    proposeHeal: () => notImplemented('proposeHeal'),
  };
}
