// apps/server/src/registry.ts (owner: Dev A)
// Builds the ServiceRegistry from the module factories (PLAN section 11.13):
// main.ts builds ONE registry; modules receive it and never import each other's files.
import type { ServiceRegistry } from '@patchwork/shared';
import type { Db } from './db/sqlite.js';
import { createCoreService } from './core/index.js';
import { createAuditService } from './core/audit.js';
import { createSnapshotService } from './snapshots/index.js';
import { createVerifyService } from './verify/index.js';
import { createReleaseService } from './releases/index.js';
import { createDriftService } from './drift/index.js';

export function buildRegistry(db: Db): ServiceRegistry {
  const registry = {} as ServiceRegistry;
  registry.audit = createAuditService();
  registry.core = createCoreService();
  registry.snapshots = createSnapshotService();
  registry.verify = createVerifyService();
  registry.releases = createReleaseService();
  registry.drift = createDriftService();
  void db; // repositories receive the db in Phase 2; the shape is frozen now.
  return registry;
}
