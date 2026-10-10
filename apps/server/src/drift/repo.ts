// apps/server/src/drift/repo.ts (owner: Dev B)
// Drift repository: the drift_reports table only (PLAN 11.15 read/write owner: B).
// Other tables (projects, releases, snapshots) are read through their owning services.
import type { DriftReport } from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';

interface DriftRow {
  id: string;
  project_id: string;
  release_id: string;
  path: string;
  previous_snapshot_id: string | null;
  snapshot_id: string;
  results_json: string;
  quarantine_release_id: string | null;
  created_at: string;
}

function rowToReport(row: DriftRow): DriftReport {
  return {
    id: row.id,
    projectId: row.project_id,
    releaseId: row.release_id,
    path: row.path,
    previousSnapshotId: row.previous_snapshot_id,
    snapshotId: row.snapshot_id,
    createdAt: row.created_at,
    results: JSON.parse(row.results_json) as DriftReport['results'],
    quarantineReleaseId: row.quarantine_release_id,
  };
}

export interface DriftRepo {
  insert(report: DriftReport): void;
  get(id: string): DriftReport | null;
  list(projectId: string): DriftReport[];
  setQuarantineRelease(reportId: string, releaseId: string): void;
}

export function createDriftRepo(db: Db): DriftRepo {
  return {
    insert(report) {
      db.prepare(
        `INSERT INTO drift_reports
           (id, project_id, release_id, path, previous_snapshot_id, snapshot_id, results_json, quarantine_release_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        report.id,
        report.projectId,
        report.releaseId,
        report.path,
        report.previousSnapshotId,
        report.snapshotId,
        JSON.stringify(report.results),
        report.quarantineReleaseId,
        report.createdAt,
      );
    },
    get(id) {
      const row = db.prepare('SELECT * FROM drift_reports WHERE id = ?').get(id) as unknown as
        | DriftRow
        | undefined;
      return row ? rowToReport(row) : null;
    },
    list(projectId) {
      const rows = db
        .prepare('SELECT * FROM drift_reports WHERE project_id = ? ORDER BY created_at DESC, id DESC')
        .all(projectId) as unknown as DriftRow[];
      return rows.map(rowToReport);
    },
    setQuarantineRelease(reportId, releaseId) {
      db.prepare('UPDATE drift_reports SET quarantine_release_id = ? WHERE id = ?').run(
        releaseId,
        reportId,
      );
    },
  };
}
