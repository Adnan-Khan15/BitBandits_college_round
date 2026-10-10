// apps/web/src/screens/DriftAuditScreen.tsx (owner: Dev D)
// Drift Sentinel + audit trail (signature feature, F2, F7): simulate the shop's own redeploy, re-check
// every live patch against the new page, show per-anchor confidence with evidence and runner-up,
// propose a quarantine release; then the measured benchmark and the hash-chained audit trail.
import { useState } from 'react';
import { DEFAULT_THRESHOLDS } from '@patchwork/shared';
import type { AuditEvent, BenchRow, DriftReport, Patch, Project, Release } from '@patchwork/shared';
import { api } from '../api.js';
import { TARGET_ORIGIN } from '../env.js';
import { usePoll } from '../usePoll.js';
import { Meter } from '../components/Meter.js';
import { EmptyState, ErrorNotice, Notice } from '../components/Notice.js';
import { Chip, PatchHealthChip, ResolutionStatusChip } from '../components/StatusChip.js';
import { firstProject, formatWhen, pct, useAction } from './shared.js';
import styles from './Screens.module.css';

interface DriftData {
  project: Project | null;
  reports: DriftReport[];
  patches: Patch[];
  releases: Release[];
  audit: AuditEvent[];
  chain: { valid: boolean; brokenAtSeq: number | null } | null;
  bench: BenchRow[];
  upstreamVersion: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  patchwork: 'PATCHWORK resolver',
  css_selector: 'Stored CSS selector',
  xpath: 'Absolute XPath',
  best_match_no_threshold: 'Best match, no threshold',
};

async function upstreamVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${TARGET_ORIGIN}/__upstream/version`);
    return ((await res.json()) as { version?: string }).version ?? null;
  } catch {
    return null; // the demo upstream is not running
  }
}

/** Latest report per path: older reports for the same page are history, not current state. */
function latestPerPath(reports: DriftReport[]): DriftReport[] {
  const seen = new Set<string>();
  return reports.filter((r) => (seen.has(r.path) ? false : (seen.add(r.path), true)));
}

export function DriftAuditScreen() {
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  const { data, error, loading, reload } = usePoll<DriftData>(async () => {
    const project = await firstProject();
    const version = await upstreamVersion();
    if (!project) {
      return { project: null, reports: [], patches: [], releases: [], audit: [], chain: null, bench: [], upstreamVersion: version };
    }
    const [reports, patches, releases, audit, chain, bench] = await Promise.all([
      api.driftReports(project.id),
      api.patches(project.id),
      api.releases(project.id),
      api.audit(project.id, { limit: 200 }),
      api.auditVerify(project.id),
      api.bench().catch(() => ({ items: [] })),
    ]);
    return {
      project,
      reports: reports.items,
      patches: patches.items,
      releases: releases.items,
      audit: audit.items,
      chain,
      bench: bench.items as unknown as BenchRow[],
      upstreamVersion: version,
    };
  }, 3000);
  const action = useAction(reload);

  if (loading && !data) return <p className={styles.small}>Loading drift and audit…</p>;
  if (error) return <ErrorNotice error={error} />;
  if (!data?.project) return <EmptyState>No project yet. Run <code>npm run reset</code> to seed ShopLite.</EmptyState>;

  const { project, patches, releases, audit, chain, bench } = data;
  const reports = latestPerPath(data.reports);
  const titleOf = (id: string) => patches.find((p) => p.id === id)?.title ?? id;
  const releaseNumber = (id: string | null) => {
    const r = releases.find((x) => x.id === id);
    return r ? `R${r.number}` : id ?? '';
  };

  const setVersion = (version: 'v1' | 'v2') =>
    action.run(`upstream-${version}`, async () => {
      const res = await fetch(`${TARGET_ORIGIN}/__upstream/version`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) throw new Error(`The demo upstream answered ${res.status}. Is npm run target running?`);
    });

  return (
    <section>
      <div className={styles.head}>
        <h1>Drift &amp; audit</h1>
      </div>
      <p className={styles.lede}>
        When the shop redeploys its own site, live patches can lose their element. Drift Sentinel re-finds
        each element from its fingerprint and refuses to guess when the evidence is weak.
      </p>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Demo control</h2>
          <span className={styles.small}>
            ShopLite upstream is serving <strong>{data.upstreamVersion ?? 'unknown (not running?)'}</strong>
          </span>
        </div>
        <div className={styles.actions}>
          <button
            className="btn"
            type="button"
            disabled={action.busy !== null || data.upstreamVersion === 'v2'}
            onClick={() => void setVersion('v2')}
          >
            Simulate upstream redeploy (v2)
          </button>
          <button
            className="btn"
            type="button"
            disabled={action.busy !== null || data.upstreamVersion === 'v1'}
            onClick={() => void setVersion('v1')}
          >
            Restore v1
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={action.busy !== null}
            onClick={() =>
              void action.run('check', async () => {
                const out = await api.driftCheck(project.id);
                setLastCheck(
                  out.items.length === 0
                    ? 'No page changed since the last check, so there is nothing new to report.'
                    : `Checked: ${out.items.length} changed page${out.items.length === 1 ? '' : 's'} re-anchored.`,
                );
              })
            }
          >
            {action.busy === 'check' ? 'Checking…' : 'Check now'}
          </button>
        </div>
        <p className={styles.small} aria-live="polite">{lastCheck ?? ''}</p>
        {action.error ? <ErrorNotice error={action.error} /> : null}
      </div>

      <div className={styles.block}>
        <h2>Patch health</h2>
        {reports.length === 0 ? (
          <EmptyState>No drift reports yet. Simulate the redeploy, then check now.</EmptyState>
        ) : (
          <div className={styles.stack}>
            {reports.map((report) => {
              const unsafe = report.results.some((r) => r.health === 'at_risk' || r.health === 'broken');
              return (
                <div key={report.id} className={styles.panel}>
                  <div className={styles.panelHead}>
                    <h3>Page {report.path}</h3>
                    <span className={styles.small}>
                      checked {formatWhen(report.createdAt)} against live {releaseNumber(report.releaseId)}
                    </span>
                  </div>
                  {report.results.map((result) => (
                    <div key={result.patchId} className={styles.block} style={{ marginTop: '0.75rem' }}>
                      <div className={styles.panelHead}>
                        <strong>{titleOf(result.patchId)}</strong>
                        <PatchHealthChip health={result.health} />
                      </div>
                      {result.resolutions.map((res) => (
                        <div key={res.anchorId} className={styles.anchorRow}>
                          <span>
                            Anchor <strong>{res.anchorId}</strong>
                          </span>
                          <ResolutionStatusChip status={res.status} />
                          <Meter
                            confidence={res.confidence}
                            margin={res.runnerUp ? res.margin : null}
                            thresholds={DEFAULT_THRESHOLDS}
                            label={`Anchor ${res.anchorId}`}
                          />
                          <div className={styles.evidence}>
                            Strongest evidence:{' '}
                            {res.evidence
                              .filter((e) => e.similarity > 0)
                              .slice(0, 3)
                              .map((e) => `${e.feature} ${pct(e.similarity)}`)
                              .join(', ') || 'none'}
                            {res.runnerUp ? (
                              <>
                                . Runner-up <span className="num">{res.runnerUp.confidence.toFixed(2)}</span>:{' '}
                                <span className="mono-id">{res.runnerUp.elementPath}</span>
                              </>
                            ) : null}
                            {res.elementPath ? (
                              <>
                                . Matched <span className="mono-id">{res.elementPath}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {report.quarantineReleaseId ? (
                    <Notice title="Quarantine proposed">
                      {releaseNumber(report.quarantineReleaseId)} leaves out the unsafe patches. Verify and deploy it
                      on <a href="#/releases">Releases</a>.
                    </Notice>
                  ) : unsafe ? (
                    <div className={styles.actions}>
                      <button
                        className="btn btn--primary"
                        type="button"
                        disabled={action.busy !== null}
                        onClick={() => void action.run('quarantine', () => api.proposeQuarantine(report.id))}
                      >
                        Propose quarantine release
                      </button>
                      <span className={styles.small}>A new release without the at-risk and broken patches.</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.block}>
        <h2>Re-anchoring benchmark</h2>
        {bench.length === 0 ? (
          <EmptyState>
            No benchmark results yet. Run <code>npm run bench -- --set all</code>.
          </EmptyState>
        ) : (
          <div className={styles.scroll}>
          <table className="table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Set</th>
                <th className="num">Cases</th>
                <th className="num">Re-anchored</th>
                <th className="num">Wrong element</th>
                <th className="num">Correctly abstained</th>
              </tr>
            </thead>
            <tbody>
              {bench.map((row) => (
                <tr key={`${row.method}-${row.set}`}>
                  <td>{METHOD_LABEL[row.method] ?? row.method}</td>
                  <td>{row.set === 'heldout' ? 'held-out' : 'dev'}</td>
                  <td className="num">{row.cases}</td>
                  <td className="num">{pct(row.reanchorRate)}</td>
                  <td className="num">{pct(row.wrongTargetRate)}</td>
                  <td className="num">{pct(row.correctAbstainRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className={styles.block}>
        <div className={styles.head}>
          <h2>Audit trail</h2>
          {chain ? (
            chain.valid ? (
              <Chip tone="healthy" glyph="✓">chain intact, {audit.length} events</Chip>
            ) : (
              <Chip tone="broken" glyph="✕">chain broken at #{chain.brokenAtSeq}</Chip>
            )
          ) : null}
        </div>
        {audit.length === 0 ? (
          <EmptyState>No events yet. Every patch, review, merge, release and deploy is recorded here.</EmptyState>
        ) : (
          <div className={styles.scroll}>
          <table className="table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>When</th>
                <th>Event</th>
                <th>Who</th>
                <th>Subject</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <tr key={e.id}>
                  <td className="num">{e.seq}</td>
                  <td className={styles.small}>{formatWhen(e.createdAt)}</td>
                  <td>{e.type}</td>
                  <td>{e.actorId}</td>
                  <td className="mono-id">
                    {e.subject.type === 'patch' ? titleOf(e.subject.id) : e.subject.type === 'release' ? releaseNumber(e.subject.id) : e.subject.id}
                  </td>
                  <td>
                    <div className={styles.pre} title={JSON.stringify(e.data)}>
                      {JSON.stringify(e.data)}
                    </div>
                    <span className="mono-id" title={e.hash}>{e.hash.slice(0, 10)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </section>
  );
}
