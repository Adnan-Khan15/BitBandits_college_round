// apps/web/src/screens/DriftScreen.tsx (owner: Dev D)
// Drift Sentinel: the shop redesigns its own pages; every live fix is re-found from its fingerprint,
// or PATCHWORK refuses to guess. One drill button runs the real steps and shows each real result.
import { useState } from 'react';
import { DEFAULT_THRESHOLDS } from '@patchwork/shared';
import type { BenchRow, DriftReport, Patch, Project, Release, User, VerificationRun } from '@patchwork/shared';
import { api } from '../api.js';
import { TARGET_ORIGIN } from '../env.js';
import { usePoll } from '../usePoll.js';
import { Meter } from '../components/Meter.js';
import { EmptyState, ErrorNotice } from '../components/Notice.js';
import { Chip, PatchHealthChip, ReleaseStatusChip } from '../components/StatusChip.js';
import { actAs, personFor } from '../team.js';
import { firstProject, pct } from './shared.js';
import styles from './Drift.module.css';

type Explain = Awaited<ReturnType<typeof api.driftExplain>>['items'];

interface DriftData {
  project: Project | null;
  reports: DriftReport[];
  explain: Record<string, Explain>;
  patches: Patch[];
  releases: Release[];
  users: User[];
  bench: BenchRow[];
  version: string | null;
}

/** What each fingerprint feature means, in words a judge understands. */
const REASON: Record<string, string> = {
  text: 'same visible text',
  accessibleName: 'same accessible name',
  neighborText: 'same text around it',
  classes: 'same styling classes',
  id: 'same id',
  testId: 'same test id',
  name: 'same form name',
  hrefSrc: 'same link',
  ancestors: 'similar place in the page',
  siblingIndex: 'same position among its siblings',
  xpath: 'same path in the page',
  tag: 'same kind of element',
  rect: 'same position on screen',
};

type StepState = 'todo' | 'running' | 'done' | 'failed';
interface DrillStep {
  label: string;
  state: StepState;
  detail: string;
}

async function upstreamVersion(): Promise<string | null> {
  try {
    return ((await (await fetch(`${TARGET_ORIGIN}/__upstream/version`)).json()) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

async function setUpstream(version: 'v1' | 'v2'): Promise<void> {
  const res = await fetch(`${TARGET_ORIGIN}/__upstream/version`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  if (!res.ok) throw new Error(`The ShopLite server answered ${res.status}. Is it running?`);
}

/** Latest report per page: older reports for the same page are history, not current state. */
function latestPerPath(reports: DriftReport[]): DriftReport[] {
  const seen = new Set<string>();
  return reports.filter((r) => (seen.has(r.path) ? false : (seen.add(r.path), true)));
}

export function DriftScreen() {
  const [steps, setSteps] = useState<DrillStep[]>([]);
  const [safe, setSafe] = useState<Release | null>(null);
  const [selectorOnly, setSelectorOnly] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const { data, error: loadError, loading, reload } = usePoll<DriftData>(async () => {
    const [project, users, version] = await Promise.all([firstProject(), api.users(), upstreamVersion()]);
    if (!project) return { project: null, reports: [], explain: {}, patches: [], releases: [], users: users.items, bench: [], version };
    const [reports, patches, releases, bench] = await Promise.all([
      api.driftReports(project.id),
      api.patches(project.id),
      api.releases(project.id),
      api.bench().catch(() => ({ items: [] })),
    ]);
    const current = latestPerPath(reports.items);
    const explained = await Promise.all(current.map(async (r) => [r.id, (await api.driftExplain(r.id)).items] as const));
    return {
      project,
      reports: current,
      explain: Object.fromEntries(explained),
      patches: patches.items,
      releases: releases.items,
      users: users.items,
      bench: bench.items as unknown as BenchRow[],
      version,
    };
  }, 3000);

  if (loading && !data) return <p className={styles.small}>Loading Drift Sentinel…</p>;
  if (loadError) return <ErrorNotice error={loadError} />;
  if (!data?.project) return <EmptyState>No project yet. Run <code>./demo.sh</code> to seed ShopLite.</EmptyState>;

  const { project, reports, explain, releases, users, bench, version } = data;
  const rm = personFor(users, 'release_manager');
  const rmName = rm?.name ?? 'the release manager';
  const safeRelease = safe ? (releases.find((r) => r.id === safe.id) ?? safe) : null;

  const runDrill = async () => {
    setBusy(true);
    setError(null);
    setSafe(null);
    const list: DrillStep[] = [
      { label: 'ShopLite redesigns its site (v2)', state: 'todo', detail: '' },
      { label: 'Check every live fix against the new pages', state: 'todo', detail: '' },
      { label: 'Build a safe release without the broken fixes', state: 'todo', detail: '' },
      { label: 'Test the safe release in a real browser', state: 'todo', detail: '' },
    ];
    const set = (i: number, state: StepState, detail = '') => {
      list[i] = { ...list[i]!, state, detail };
      setSteps([...list]);
    };
    setSteps([...list]);
    try {
      set(0, 'running');
      if (version !== 'v2') await setUpstream('v2');
      set(0, 'done', 'the shop deployed its redesign; its own code changed, ours did not');

      set(1, 'running');
      const checked = (await api.driftCheck(project.id)).items;
      const results = (checked.length > 0 ? checked : reports).flatMap((r) => r.results);
      const healed = results.filter((r) => r.health === 'healthy' || r.health === 'healed').length;
      const unsafe = results.filter((r) => r.health === 'at_risk' || r.health === 'broken').length;
      set(1, 'done', `${results.length} live fixes checked: ${healed} still found, ${unsafe} could not be placed safely`);
      reload();

      const source = (checked.length > 0 ? checked : reports).find((r) => r.results.some((x) => x.health === 'at_risk' || x.health === 'broken'));
      if (!source) {
        set(2, 'done', 'not needed: every fix was found again');
        set(3, 'done', 'not needed');
        return;
      }
      set(2, 'running');
      const release = rm ? await actAs(rm.id, () => api.proposeQuarantine(source.id)) : await api.proposeQuarantine(source.id);
      setSafe(release);
      set(2, 'done', `R${release.number} keeps ${release.patches.length} fix${release.patches.length === 1 ? '' : 'es'}: ${release.patches.map((p) => p.title).join(', ') || 'none'}`);

      set(3, 'running');
      let run: VerificationRun = rm ? await actAs(rm.id, () => api.verifyRelease(release.id)) : await api.verifyRelease(release.id);
      while (run.status === 'queued' || run.status === 'running') {
        await new Promise((ok) => setTimeout(ok, 1200));
        run = await api.verification(run.id);
      }
      set(3, run.status === 'passed' ? 'done' : 'failed', run.status === 'passed' ? 'passed on the redesigned site' : run.summary);
    } catch (err) {
      setError(err);
      const i = list.findIndex((s) => s.state === 'running');
      if (i >= 0) set(i, 'failed', 'stopped');
    } finally {
      setBusy(false);
      reload();
    }
  };

  const shipSafe = async () => {
    if (!safeRelease) return;
    setBusy(true);
    setError(null);
    try {
      const go = () => api.deployRelease(safeRelease.id, { force: false, reason: 'Safe release after the ShopLite redesign' });
      if (rm) await actAs(rm.id, go);
      else await go();
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      await setUpstream('v1');
      setSteps([]);
      setSafe(null);
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const held = bench.filter((r) => r.set === 'heldout');
  const benchRows = held.length > 0 ? held : bench.filter((r) => r.set === 'dev');
  const ours = benchRows.find((r) => r.method === 'patchwork');
  const css = benchRows.find((r) => r.method === 'css_selector');
  const chartMethods = (['patchwork', 'css_selector', 'xpath'] as const)
    .map((m) => benchRows.find((r) => r.method === m))
    .filter((r): r is BenchRow => r !== undefined);
  const METHOD: Record<string, string> = { patchwork: 'PATCHWORK', css_selector: 'CSS selector', xpath: 'XPath' };

  return (
    <section className={styles.drift}>
      <h1>Drift Sentinel</h1>
      <p className={styles.lede}>
        When ShopLite redesigns its own pages, your fixes can lose their element. Drift Sentinel finds them again, or
        refuses to guess.
      </p>

      <div className={styles.drill}>
        <div className={styles.drillHead}>
          <button type="button" className="btn btn--patch btn--big" disabled={busy} onClick={() => void runDrill()}>
            {busy ? 'Running the drill…' : 'Run drift drill'}
          </button>
          <button type="button" className="btn" disabled={busy || version === 'v1'} onClick={() => void restore()}>
            Restore original site (v1)
          </button>
          <span className={styles.small}>
            ShopLite is serving <strong>{version === 'v2' ? 'the redesign (v2)' : version === 'v1' ? 'the original (v1)' : 'nothing (not running?)'}</strong>
          </span>
        </div>
        {steps.length > 0 ? (
          <ol className={styles.steps} aria-live="polite">
            {steps.map((s, i) => (
              <li key={i} className={styles[s.state]}>
                <span className={styles.stepGlyph} aria-hidden="true">
                  {s.state === 'done' ? '✓' : s.state === 'failed' ? '✕' : s.state === 'running' ? '◔' : '○'}
                </span>
                <span>
                  <strong>{s.label}</strong>
                  {s.detail ? <span className={styles.small}> {s.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {safeRelease ? (
          <div className={styles.shipRow}>
            <span>
              Safe release <strong>R{safeRelease.number}</strong> <ReleaseStatusChip status={safeRelease.status} />
            </span>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || safeRelease.status !== 'verified'}
              onClick={() => void shipSafe()}
            >
              Ship safe release as {rmName}
            </button>
          </div>
        ) : null}
        {error ? <ErrorNotice error={error} /> : null}
      </div>

      {/* ---- per-fix evidence ---- */}
      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h2>Your live fixes on the redesigned site</h2>
          <label className={styles.toggle}>
            <input type="checkbox" checked={selectorOnly} onChange={(e) => setSelectorOnly(e.target.checked)} /> What would a
            selector-only tool do?
          </label>
        </div>
        {reports.length === 0 ? (
          <EmptyState>No drift checks yet. Run the drift drill.</EmptyState>
        ) : (
          <div className={styles.cards}>
            {reports.flatMap((report) =>
              report.results.map((result) => {
                const words = explain[report.id]?.find((x) => x.patchId === result.patchId);
                return (
                  <article key={`${report.id}-${result.patchId}`} className={styles.card}>
                    <header className={styles.cardHead}>
                      <h3>{words?.title ?? 'A fix'}</h3>
                      <span className={styles.small}>page {report.path}</span>
                      {selectorOnly ? (
                        words?.anchors.every((a) => a.selectorFound) ? (
                          <Chip tone="healthy" glyph="✓">selector still matches</Chip>
                        ) : (
                          <Chip tone="broken" glyph="✕">not found, fix silently lost</Chip>
                        )
                      ) : (
                        <PatchHealthChip health={result.health} />
                      )}
                    </header>
                    {result.resolutions.map((res) => {
                      const w = words?.anchors.find((a) => a.anchorId === res.anchorId);
                      const reasons = res.evidence
                        .filter((e) => e.similarity >= 0.5 && e.feature !== 'tag')
                        .slice(0, 3)
                        .map((e) => REASON[e.feature] ?? e.feature);
                      if (selectorOnly) {
                        return (
                          <p key={res.anchorId} className={styles.sentence}>
                            {w?.selectorFound
                              ? `The stored selector still points at “${w.selectorText ?? ''}”.`
                              : `The stored CSS selector matches nothing on the new page. A selector-only tool would skip this fix without telling anyone.`}
                          </p>
                        );
                      }
                      return (
                        <div key={res.anchorId} className={styles.evidence}>
                          <Meter
                            confidence={res.confidence}
                            margin={res.runnerUp ? res.margin : null}
                            thresholds={DEFAULT_THRESHOLDS}
                            label={`Match for ${words?.title ?? 'this fix'}`}
                          />
                          <p className={styles.sentence}>
                            {res.status === 'exact' || res.status === 'relocated'
                              ? `Found ${w?.matchedText ? `“${w.matchedText}”` : 'it'} again${reasons.length ? `: ${reasons.join(', ')}` : ''}.`
                              : res.status === 'ambiguous'
                                ? 'Two elements look equally right, so PATCHWORK will not choose. A person must pick.'
                                : `Not found with enough confidence${w?.originalText ? ` (was “${w.originalText}”)` : ''}. PATCHWORK refuses to guess.`}
                          </p>
                          {res.runnerUp && w?.runnerUpText && res.runnerUp.confidence < res.confidence ? (
                            <p className={styles.small}>
                              “{w.runnerUpText}” looked similar: scored {res.runnerUp.confidence.toFixed(2)}, rejected.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </article>
                );
              }),
            )}
          </div>
        )}
      </div>

      {/* ---- benchmark ---- */}
      <div className={styles.block}>
        <h2>How often it finds the right element</h2>
        {ours && css ? (
          <p className={styles.lede}>
            On {ours.cases} {held.length > 0 ? 'held-out cases the resolver was never tuned on' : 'benchmark cases'}, PATCHWORK re-found{' '}
            <strong>{pct(ours.reanchorRate)}</strong> of the elements and picked the wrong one{' '}
            <strong>{pct(ours.wrongTargetRate)}</strong> of the time. A stored CSS selector re-found {pct(css.reanchorRate)} and picked the
            wrong one {pct(css.wrongTargetRate)} of the time.
          </p>
        ) : (
          <EmptyState>No benchmark yet. Run <code>npm run bench -- --set all</code>.</EmptyState>
        )}
        {chartMethods.length > 0 ? (
          <div className={styles.charts}>
            {(
              [
                ['reanchorRate', 'Re-found the element', 'higher is better'],
                ['wrongTargetRate', 'Picked the wrong element', 'lower is better'],
              ] as const
            ).map(([key, title, hint]) => (
              <figure key={key} className={styles.chart}>
                <figcaption>
                  <strong>{title}</strong> <span className={styles.small}>{hint}</span>
                </figcaption>
                {chartMethods.map((row) => (
                  <div key={row.method} className={styles.barRow} title={`${METHOD[row.method]}: ${pct(row[key])}`}>
                    <span className={styles.barLabel}>{METHOD[row.method]}</span>
                    <span className={styles.barTrack}>
                      <span
                        className={`${styles.bar} ${row.method === 'patchwork' ? styles.barOurs : ''}`}
                        style={{ width: `${Math.max(row[key] * 100, 0.6)}%` }}
                      />
                    </span>
                    <span className={`${styles.barValue} num`}>{pct(row[key])}</span>
                  </div>
                ))}
              </figure>
            ))}
          </div>
        ) : null}
        {bench.length > 0 ? (
          <>
            <button type="button" className={styles.linkBtn} aria-expanded={showNumbers} onClick={() => setShowNumbers((s) => !s)}>
              {showNumbers ? 'Hide all numbers' : 'Show all numbers'}
            </button>
            {showNumbers ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Cases</th>
                    <th className="num">Re-found</th>
                    <th className="num">Wrong element</th>
                    <th className="num">Correctly refused</th>
                  </tr>
                </thead>
                <tbody>
                  {bench.map((r) => (
                    <tr key={`${r.method}-${r.set}`}>
                      <td>{METHOD[r.method] ?? (r.method === 'best_match_no_threshold' ? 'Best match, no threshold' : r.method)}</td>
                      <td>
                        {r.cases} {r.set === 'heldout' ? 'held-out' : 'tuning'}
                      </td>
                      <td className="num">{pct(r.reanchorRate)}</td>
                      <td className="num">{pct(r.wrongTargetRate)}</td>
                      <td className="num">{pct(r.correctAbstainRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
