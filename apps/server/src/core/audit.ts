// apps/server/src/core/audit.ts (owner: Dev A)
// The audit chain (PLAN 11.10): append-only, one SHA-256 hash chain per project.
// hash = sha256hex(prevHash + '\n' + canonicalJson({seq,id,projectId,type,actorId,subject,data,createdAt}))
// first prevHash = '0'.repeat(64); rows are only ever INSERTed, never updated or deleted.
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import type { AuditEvent, AuditService, AuditType, Id } from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';

export const GENESIS_HASH = '0'.repeat(64);

/** JSON with object keys sorted recursively; undefined members dropped like JSON.stringify. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function hashEvent(prevHash: string, e: Omit<AuditEvent, 'prevHash' | 'hash'>): string {
  const payload = canonicalJson({
    seq: e.seq,
    id: e.id,
    projectId: e.projectId,
    type: e.type,
    actorId: e.actorId,
    subject: e.subject,
    data: e.data,
    createdAt: e.createdAt,
  });
  return createHash('sha256').update(`${prevHash}\n${payload}`).digest('hex');
}

interface AuditRow {
  seq: number;
  id: string;
  project_id: string;
  type: string;
  actor_id: string;
  subject_type: string;
  subject_id: string;
  data_json: string;
  prev_hash: string;
  hash: string;
  created_at: string;
}

function rowToEvent(r: AuditRow): AuditEvent {
  return {
    seq: r.seq,
    id: r.id,
    projectId: r.project_id,
    type: r.type as AuditType,
    actorId: r.actor_id,
    subject: { type: r.subject_type as AuditEvent['subject']['type'], id: r.subject_id },
    data: JSON.parse(r.data_json) as Record<string, unknown>,
    prevHash: r.prev_hash,
    hash: r.hash,
    createdAt: r.created_at,
  };
}

export function createAuditService(db: Db): AuditService {
  return {
    append(e): AuditEvent {
      // node:sqlite is synchronous, so read-last + insert cannot interleave with another append.
      const last = db
        .prepare('SELECT hash FROM audit_events WHERE project_id = ? ORDER BY seq DESC LIMIT 1')
        .get(e.projectId) as { hash: string } | undefined;
      const maxSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM audit_events').get() as {
        m: number;
      };
      const prevHash = last?.hash ?? GENESIS_HASH;
      const event: Omit<AuditEvent, 'prevHash' | 'hash'> = {
        seq: maxSeq.m + 1,
        id: `aud_${nanoid(12)}`,
        projectId: e.projectId,
        type: e.type,
        actorId: e.actorId,
        subject: { type: e.subject.type, id: e.subject.id },
        // Round-trip so the hashed data is exactly what verifyChain reads back from data_json.
        data: JSON.parse(JSON.stringify(e.data ?? {})) as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      };
      const hash = hashEvent(prevHash, event);
      db.prepare(
        `INSERT INTO audit_events
           (seq, id, project_id, type, actor_id, subject_type, subject_id, data_json, prev_hash, hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        event.seq,
        event.id,
        event.projectId,
        event.type,
        event.actorId,
        event.subject.type,
        event.subject.id,
        JSON.stringify(event.data),
        prevHash,
        hash,
        event.createdAt,
      );
      return { ...event, prevHash, hash };
    },

    list(projectId: Id, opts?: { type?: AuditType; limit?: number }): AuditEvent[] {
      const limit = Math.max(1, Math.min(opts?.limit ?? 500, 5000));
      const rows = (
        opts?.type
          ? db
              .prepare(
                'SELECT * FROM audit_events WHERE project_id = ? AND type = ? ORDER BY seq DESC LIMIT ?',
              )
              .all(projectId, opts.type, limit)
          : db
              .prepare('SELECT * FROM audit_events WHERE project_id = ? ORDER BY seq DESC LIMIT ?')
              .all(projectId, limit)
      ) as unknown as AuditRow[];
      return rows.map(rowToEvent); // newest first
    },

    verifyChain(projectId: Id): { valid: boolean; brokenAtSeq: number | null } {
      const rows = db
        .prepare('SELECT * FROM audit_events WHERE project_id = ? ORDER BY seq ASC')
        .all(projectId) as unknown as AuditRow[];
      let prevHash = GENESIS_HASH;
      for (const row of rows) {
        const event = rowToEvent(row);
        if (event.prevHash !== prevHash || hashEvent(prevHash, event) !== event.hash) {
          return { valid: false, brokenAtSeq: event.seq };
        }
        prevHash = event.hash;
      }
      return { valid: true, brokenAtSeq: null };
    },
  };
}
