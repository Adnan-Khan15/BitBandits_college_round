// apps/server/src/core/audit.ts (owner: Dev A)
// Phase 2 step 11: the AuditService with the SHA-256 hash chain of PLAN 11.10.
//   hash = sha256hex(prevHash + '\n' + canonicalJson({seq,id,projectId,type,actorId,subject,data,createdAt}))
//   first prevHash = '0'.repeat(64); events are only ever INSERTed.
// T-AUD-1: append 3 -> verify valid. T-AUD-2: tamper a row -> brokenAtSeq.
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import type { AuditEvent, AuditService, AuditType, Id, IsoTime } from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';

const ZERO_HASH = '0'.repeat(64);

/** PLAN 11.10: canonical JSON = keys sorted recursively. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(',')}}`;
}

/** PLAN 11.10: hash = sha256hex(prevHash + '\n' + canonicalJson(payload)) */
export function auditHash(payload: Parameters<typeof canonicalJson>[0], prevHash: string): string {
  return createHash('sha256').update(`${prevHash}\n${canonicalJson(payload)}`, 'utf8').digest('hex');
}

type AuditRow = {
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
};

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

function eventHashPayload(e: AuditEvent): unknown {
  return { seq: e.seq, id: e.id, projectId: e.projectId, type: e.type, actorId: e.actorId, subject: e.subject, data: e.data, createdAt: e.createdAt };
}

export function createAuditService(db: Db): AuditService {
  return {
    append(e: Omit<AuditEvent, 'seq' | 'id' | 'prevHash' | 'hash' | 'createdAt'>): AuditEvent {
      const seqRow = db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM audit_events').get() as { next: number };
      const lastRow = db
        .prepare('SELECT hash, seq FROM audit_events WHERE project_id = ? ORDER BY seq DESC LIMIT 1')
        .get(e.projectId) as { hash: string; seq: number } | undefined;
      const prevHash = lastRow ? lastRow.hash : ZERO_HASH;
      const id: Id = `aud_${nanoid(12)}`;
      const createdAt: IsoTime = new Date().toISOString();

      const event: AuditEvent = {
        seq: seqRow.next,
        id,
        projectId: e.projectId,
        type: e.type,
        actorId: e.actorId,
        subject: e.subject,
        data: e.data,
        prevHash,
        createdAt,
        hash: '',
      };
      event.hash = auditHash(eventHashPayload(event), prevHash);

      db.prepare(
        'INSERT INTO audit_events (seq, id, project_id, type, actor_id, subject_type, subject_id, data_json, prev_hash, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        event.seq,
        event.id,
        event.projectId,
        event.type,
        event.actorId,
        event.subject.type,
        event.subject.id,
        JSON.stringify(event.data),
        event.prevHash,
        event.hash,
        event.createdAt,
      );
      return event;
    },

    list(projectId: Id, opts?: { type?: AuditType; limit?: number }): AuditEvent[] {
      const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 1000);
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
      ) as AuditRow[];
      return rows.map(rowToEvent);
    },

    verifyChain(projectId: Id): { valid: boolean; brokenAtSeq: number | null } {
      const rows = db
        .prepare('SELECT * FROM audit_events WHERE project_id = ? ORDER BY seq ASC')
        .all(projectId) as AuditRow[];
      let expectedPrev = ZERO_HASH;
      for (const r of rows) {
        // Stored linkage must match the recomputed chain...
        if (r.prev_hash !== expectedPrev) return { valid: false, brokenAtSeq: r.seq };
        // ...and the stored hash must match a fresh computation over the row's payload.
        const expectedHash = auditHash(eventHashPayload(rowToEvent(r)), expectedPrev);
        if (r.hash !== expectedHash) return { valid: false, brokenAtSeq: r.seq };
        expectedPrev = r.hash;
      }
      return { valid: true, brokenAtSeq: null };
    },
  };
}
