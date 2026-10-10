// apps/server/src/core/audit.test.ts (owner: Dev A) - T-AUD-1, T-AUD-2
import { afterAll, describe, expect, it } from 'vitest';
import { createAuditService } from './audit.js';
import { migrate } from '../db/migrate.js';
import { openDb, type Db } from '../db/sqlite.js';

const db: Db = openDb(':memory:');
migrate(db);
const audit = createAuditService(db);
afterAll(() => db.close());

const append = (i: number) =>
  audit.append({
    projectId: 'prj_shoplite',
    type: 'patch.created',
    actorId: 'usr_dev1',
    subject: { type: 'patch', id: `pat_${i}` },
    data: { n: i },
  });

describe('audit chain (T-AUD-1)', () => {
  it('appends three events and verifies the chain', () => {
    const e1 = append(1);
    const e2 = append(2);
    const e3 = append(3);
    expect(e1.prevHash).toBe('0'.repeat(64));
    expect(e2.prevHash).toBe(e1.hash);
    expect(e3.prevHash).toBe(e2.hash);
    expect(e2.seq).toBe(e1.seq + 1);
    expect(audit.verifyChain('prj_shoplite')).toEqual({ valid: true, brokenAtSeq: null });
  });

  it('lists newest first and filters by type', () => {
    const all = audit.list('prj_shoplite');
    const seqs = all.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));
    expect(audit.list('prj_shoplite', { type: 'patch.created' }).length).toBeGreaterThanOrEqual(3);
    expect(audit.list('prj_shoplite', { type: 'release.deployed' })).toEqual([]);
  });
});

describe('audit chain (T-AUD-2)', () => {
  // Each tamper case gets a fresh database so "first broken seq" is unambiguous.

  it('reports brokenAtSeq when a row is tampered with via SQL', () => {
    const localDb = openDb(':memory:');
    migrate(localDb);
    const local = createAuditService(localDb);
    const victim = local.append({
      projectId: 'p',
      type: 'patch.created',
      actorId: 'usr_dev1',
      subject: { type: 'patch', id: 'pat_1' },
      data: { n: 1 },
    });
    local.append({
      projectId: 'p',
      type: 'patch.created',
      actorId: 'usr_dev1',
      subject: { type: 'patch', id: 'pat_2' },
      data: {},
    });
    expect(local.verifyChain('p')).toEqual({ valid: true, brokenAtSeq: null });
    localDb
      .prepare('UPDATE audit_events SET data_json = ? WHERE seq = ?')
      .run(JSON.stringify({ tampered: true }), victim.seq);
    expect(local.verifyChain('p')).toEqual({ valid: false, brokenAtSeq: victim.seq });
  });

  it('reports brokenAtSeq when a hash link is rewritten', () => {
    const localDb = openDb(':memory:');
    migrate(localDb);
    const local = createAuditService(localDb);
    const a = local.append({
      projectId: 'p',
      type: 'patch.created',
      actorId: 'usr_dev1',
      subject: { type: 'patch', id: 'pat_1' },
      data: {},
    });
    const b = local.append({
      projectId: 'p',
      type: 'patch.created',
      actorId: 'usr_dev1',
      subject: { type: 'patch', id: 'pat_2' },
      data: {},
    });
    expect(a.prevHash).toBe('0'.repeat(64));
    expect(b.prevHash).toBe(a.hash);
    // Rewrite b's prev_hash to break the linkage without touching b's own hash.
    localDb
      .prepare('UPDATE audit_events SET prev_hash = ? WHERE seq = ?')
      .run('f'.repeat(64), b.seq);
    expect(local.verifyChain('p')).toEqual({ valid: false, brokenAtSeq: b.seq });
  });

  it('verifies an independent project chain separately', () => {
    const localDb = openDb(':memory:');
    migrate(localDb);
    const local = createAuditService(localDb);
    local.append({
      projectId: 'prj_other',
      type: 'verification.finished',
      actorId: 'system',
      subject: { type: 'verification', id: 'ver_1' },
      data: {},
    });
    expect(local.verifyChain('prj_other')).toEqual({ valid: true, brokenAtSeq: null });
    expect(local.verifyChain('prj_missing')).toEqual({ valid: true, brokenAtSeq: null });
  });
});
