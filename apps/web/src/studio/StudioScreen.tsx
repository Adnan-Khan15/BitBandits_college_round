// apps/web/src/studio/StudioScreen.tsx (owner: Dev D)
// The Studio: the website is the hero. Left, the real site in three views (your preview, the live
// site, the untouched original). Right, a three-step fix panel: pick something on the page, choose
// a fix in plain words (the preview updates as you go), prove it in a real browser, send it for review.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Deployment, Patch, PreviewSpec, Project, Release, VerificationRun } from '@patchwork/shared';
import { api, isApiClientError } from '../api.js';
import { LIVE_ORIGIN, PREVIEW_ORIGIN, TARGET_ORIGIN } from '../env.js';
import { usePoll } from '../usePoll.js';
import { highlightMessage, pickStartMessage, pickStopMessage, useRuntimeBridge } from '../preview/bridge.js';
import { ErrorNotice } from '../components/Notice.js';
import { Chip, PatchStatusChip } from '../components/StatusChip.js';
import { useCurrentUserId } from '../user.js';
import { nameOf, useTeam } from '../team.js';
import {
  ATTR_CHOICES,
  emptyForm,
  FIX_CHOICES,
  labelOf,
  opsFor,
  STYLE_PRESETS,
  stepText,
  suggestedChecks,
  titleFor,
  type FixForm,
  type Picked,
} from './fixes.js';
import styles from './Studio.module.css';

type Tab = 'preview' | 'live' | 'original';

interface SiteState {
  project: Project | null;
  releases: Release[];
  deployments: Deployment[];
  patches: Patch[];
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function StudioScreen() {
  const team = useTeam();
  const userId = useCurrentUserId();

  /* --- the site: project, live release, my fixes (polled every 2 s) ------------------- */
  const { data: site } = usePoll<SiteState>(async () => {
    const project = (await api.projects()).items[0] ?? null;
    if (!project) return { project: null, releases: [], deployments: [], patches: [] };
    const [releases, deployments, patches] = await Promise.all([
      api.releases(project.id),
      api.deployments(project.id),
      api.patches(project.id),
    ]);
    return { project, releases: releases.items, deployments: deployments.items, patches: patches.items };
  }, 2000);
  const project = site?.project ?? null;
  const releases = site?.releases ?? [];
  const liveRelease = releases.find((r) => r.id === project?.liveReleaseId) ?? null;

  /* --- frames ---------------------------------------------------------------------------- */
  const [tab, setTab] = useState<Tab>('preview');
  const [sideBySide, setSideBySide] = useState(false);
  const [path, setPath] = useState('/cart');
  const [liveKey, setLiveKey] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [toast, setToast] = useState<{ text: string; tone: 'live' | 'back' } | null>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);

  // The live site updates by itself: when the live release changes, reload the Live view and say so.
  const lastLive = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!project) return;
    const now = project.liveReleaseId;
    if (lastLive.current !== undefined && lastLive.current !== now) {
      const newest = site?.deployments[0];
      const r = releases.find((x) => x.id === now);
      const label = r ? `R${r.number}` : 'no release (the original site)';
      const back = newest?.kind === 'rollback' || newest?.kind === 'auto_rollback';
      setToast({
        text: back
          ? `${newest?.kind === 'auto_rollback' ? 'Health check failed: automatically rolled back' : 'Rolled back'} to ${label}`
          : `Live site updated to ${label}`,
        tone: back ? 'back' : 'live',
      });
      setLiveKey((k) => k + 1);
    }
    lastLive.current = now;
  }, [project, releases, site?.deployments]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  /* --- the fix ----------------------------------------------------------------------------- */
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [picking, setPicking] = useState<'a1' | 'a2' | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [form, setForm] = useState<FixForm>(emptyForm);
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [removedChecks, setRemovedChecks] = useState<number[]>([]);
  const [sentPatch, setSentPatch] = useState<Patch | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [run, setRun] = useState<VerificationRun | null>(null);

  const ops = opsFor(form);
  const checks = suggestedChecks(form).filter((_, i) => !removedChecks.includes(i));
  const autoTitle = titleFor(form, picked);
  const effectiveTitle = titleEdited ? title : autoTitle;

  const update = (patch: Partial<FixForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setRemovedChecks([]);
    setRun(null);
  };

  /* --- preview: one preview per Studio session; the draft rides on it ---------------------- */
  const [preview, setPreview] = useState<{ id: string } | null>(null);
  const spec: PreviewSpec | null = useMemo(() => {
    if (sentPatch) return { base: 'live', include: [sentPatch.id], exclude: [], draft: null, resolverMode: 'smart' };
    const anchors: Record<string, Picked['fingerprint']> = {};
    if (picked) anchors.a1 = picked.fingerprint;
    if (form.kind === 'move' && form.moveRef) anchors.a2 = form.moveRef.fingerprint;
    const draft =
      picked && ops
        ? {
            title: effectiveTitle || 'Untitled fix',
            urlPath: picked.path,
            anchors,
            ops,
            checks,
            baseSnapshotId: null,
            baseValues: (form.kind === 'text' ? { 0: picked.current.text } : {}) as Record<number, string | null>,
          }
        : null;
    return { base: 'live', include: [], exclude: [], draft, resolverMode: 'smart' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify([picked?.fingerprint, form, effectiveTitle, removedChecks, sentPatch?.id, sentPatch?.revision])]);

  const specJson = JSON.stringify(spec);
  const lastSpec = useRef<string>('');
  useEffect(() => {
    if (!project || !spec) return;
    if (specJson === lastSpec.current) return;
    const handle = window.setTimeout(async () => {
      try {
        if (!preview) {
          const res = await api.createPreview(project.id, spec);
          setPreview({ id: res.preview.id });
        } else {
          await api.updatePreview(preview.id, spec);
          setPreviewKey((k) => k + 1); // every change shows up in the preview straight away
        }
        lastSpec.current = specJson;
        setError(null);
      } catch (err) {
        setError(err);
      }
    }, 350);
    return () => window.clearTimeout(handle);
  }, [project, preview, spec, specJson]);

  const previewSrc = preview
    ? `${PREVIEW_ORIGIN}/__patchwork/preview/${preview.id}?path=${encodeURIComponent(path)}&editor=1&k=${previewKey}`
    : null;

  /* --- picking through the runtime bridge ------------------------------------------------- */
  const { send } = useRuntimeBridge({
    previewOrigin: PREVIEW_ORIGIN,
    onReady: (_status, framePath) => {
      if (framePath !== path) setPath(framePath);
      // after every preview reload, outline the picked element again
      if (picked && framePath === picked.path) send(highlightMessage(picked.fingerprint), previewFrame.current);
    },
    onPicked: (fingerprint, elementPath, current) => {
      const p: Picked = { fingerprint, elementPath, current, path };
      if (picking === 'a2') {
        update({ moveRef: p });
      } else {
        setPicked(p);
        setForm(emptyForm());
        setRemovedChecks([]);
        setTitleEdited(false);
        setSentPatch(null);
        setRun(null);
        setStep(2);
      }
      setPicking(null);
      send(highlightMessage(fingerprint), previewFrame.current);
    },
  });

  const startPick = (which: 'a1' | 'a2') => {
    setTab('preview');
    setSideBySide(false);
    setPicking(which);
    window.setTimeout(() => send(pickStartMessage(), previewFrame.current), 50);
  };
  const stopPick = () => {
    setPicking(null);
    send(pickStopMessage(), previewFrame.current);
  };

  const reset = () => {
    setPicked(null);
    setForm(emptyForm());
    setTitle('');
    setTitleEdited(false);
    setRemovedChecks([]);
    setSentPatch(null);
    setRun(null);
    setError(null);
    setStep(1);
    send(highlightMessage(null), previewFrame.current);
  };

  /* --- prove: a real browser run of this preview ------------------------------------------ */
  const testNow = async () => {
    if (!project || !preview) return;
    setBusy('test');
    setError(null);
    try {
      let r = await api.runVerification(project.id, { kind: 'preview', previewId: preview.id });
      setRun(r);
      while (r.status === 'queued' || r.status === 'running') {
        await new Promise((ok) => setTimeout(ok, 1200));
        r = await api.verification(r.id);
        setRun(r);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const sendForReview = async () => {
    if (!project || !picked || !ops) return;
    setBusy('send');
    setError(null);
    try {
      const anchors: Record<string, Picked['fingerprint']> = { a1: picked.fingerprint };
      if (form.kind === 'move' && form.moveRef) anchors.a2 = form.moveRef.fingerprint;
      const created = await api.createPatch(project.id, {
        title: effectiveTitle,
        description: `Fixed in the Studio on ${picked.path}.`,
        urlPath: picked.path,
        anchors,
        ops,
        checks,
        baseSnapshotId: null,
        baseValues: form.kind === 'text' ? { 0: picked.current.text } : {},
      });
      const submitted = await api.submitPatch(created.id);
      setSentPatch(submitted);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  /* --- render ------------------------------------------------------------------------------ */
  const paths = project?.paths ?? ['/', '/cart', '/checkout'];
  const myFixes = (site?.patches ?? []).filter((p) => p.authorId === userId);
  const liveIds = new Set(liveRelease?.patches.map((p) => p.patchId) ?? []);

  const frameFor = (which: Tab) => {
    if (which === 'preview') {
      return previewSrc ? (
        <iframe
          key={`p-${previewKey}-${preview?.id}`}
          ref={previewFrame}
          className={styles.frame}
          title="Preview: your fix, not shipped"
          src={previewSrc}
        />
      ) : (
        <div className={styles.frameEmpty}>Opening the preview…</div>
      );
    }
    const origin = which === 'live' ? LIVE_ORIGIN : TARGET_ORIGIN;
    return (
      <iframe
        key={`${which}-${liveKey}-${path}`}
        className={styles.frame}
        title={which === 'live' ? 'Live site: what customers see' : 'Original site: untouched'}
        src={`${origin}${path}`}
      />
    );
  };

  const caption: Record<Tab, string> = {
    preview: picked ? 'Your fix, not shipped yet. Only you see this.' : 'The live site plus your unshipped fix. Only you see this.',
    live: `What customers see right now: ${liveRelease ? `release R${liveRelease.number}` : 'no release yet, the original site'}.`,
    original: "ShopLite's own server. Its code is never changed.",
  };

  return (
    <div className={styles.studio}>
      {/* ---------------- website ---------------- */}
      <section className={styles.site} aria-label="The website">
        <div className={styles.siteBar}>
          <div className={styles.tabs} role="tablist" aria-label="Which version of the site">
            {(['preview', 'live', 'original'] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={!sideBySide && tab === t}
                className={`${styles.tab} ${styles[`tab_${t}`]}`}
                onClick={() => {
                  setTab(t);
                  setSideBySide(false);
                }}
              >
                <span className={styles.dot} aria-hidden="true" />
                {t === 'preview' ? 'Preview' : t === 'live' ? 'Live site' : 'Original'}
              </button>
            ))}
            <button
              type="button"
              className={styles.tab}
              aria-pressed={sideBySide}
              onClick={() => setSideBySide((s) => !s)}
            >
              Original vs live
            </button>
          </div>
          <div className={styles.pathBar}>
            {paths.map((p) => (
              <button
                key={p}
                type="button"
                className={styles.pathBtn}
                aria-pressed={path === p}
                onClick={() => setPath(p)}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className={styles.pathBtn}
              onClick={() => {
                setLiveKey((k) => k + 1);
                setPreviewKey((k) => k + 1);
              }}
              aria-label="Reload the site"
              title="Reload"
            >
              ↻
            </button>
          </div>
        </div>

        <p className={styles.caption}>
          {sideBySide ? 'Left: the untouched original. Right: what customers see through PATCHWORK.' : caption[tab]}
        </p>

        <div className={sideBySide ? styles.framesPair : styles.frames}>
          {sideBySide ? (
            <>
              {frameFor('original')}
              {frameFor('live')}
            </>
          ) : (
            <>
              {/* the preview frame stays mounted so picking and live updates never lose it */}
              <div className={styles.frameSlot} hidden={tab !== 'preview'}>
                {frameFor('preview')}
              </div>
              {tab !== 'preview' ? frameFor(tab) : null}
            </>
          )}
        </div>

        {toast ? (
          <div className={`${styles.toast} ${toast.tone === 'back' ? styles.toastBack : ''}`} role="status">
            <span aria-hidden="true">{toast.tone === 'back' ? '↩' : '●'}</span> {toast.text}
          </div>
        ) : null}
      </section>

      {/* ---------------- fix panel ---------------- */}
      <aside className={styles.panel} aria-label="Fix it">
        <ol className={styles.steps}>
          {(['Pick', 'Fix', 'Prove'] as const).map((label, i) => (
            <li key={label}>
              <button
                type="button"
                className={styles.stepBtn}
                aria-current={step === i + 1 ? 'step' : undefined}
                disabled={i > 0 && !picked}
                onClick={() => setStep((i + 1) as 1 | 2 | 3)}
              >
                <span className={`${styles.stepNum} num`}>{i + 1}</span> {label}
              </button>
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <div className={styles.stepBody}>
            <h2>Pick what is broken</h2>
            <p className={styles.lede}>
              Click the element on the website itself. Nothing on the real site changes until a teammate reviews
              and ships your fix.
            </p>
            {picking === 'a1' ? (
              <button type="button" className="btn btn--big" onClick={stopPick}>
                Cancel picking
              </button>
            ) : (
              <button type="button" className="btn btn--patch btn--big" onClick={() => startPick('a1')} disabled={!preview}>
                Pick something on the page
              </button>
            )}
            {picking ? <p className={styles.hint}>Now click an element in the preview.</p> : null}
            {picked ? (
              <div className={styles.pickedChip}>
                <span className={styles.tagBadge}>{picked.fingerprint.tag}</span>
                <span>{labelOf(picked)}</span>
                <span className="muted">on {picked.path}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 && picked ? (
          <div className={styles.stepBody}>
            <div className={styles.pickedChip}>
              <span className={styles.tagBadge}>{picked.fingerprint.tag}</span>
              <span>{labelOf(picked)}</span>
              <button type="button" className={styles.linkBtn} onClick={() => startPick('a1')}>
                Pick again
              </button>
            </div>
            <h2>What should it do instead?</h2>
            <div className={styles.choices} role="radiogroup" aria-label="Kind of fix">
              {FIX_CHOICES.map((c) => (
                <button
                  key={c.kind}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === c.kind}
                  className={styles.choice}
                  onClick={() => update({ kind: c.kind, text: c.kind === 'text' && !form.text ? picked.current.text : form.text })}
                >
                  <strong>{c.label}</strong>
                  <span>{c.hint}</span>
                </button>
              ))}
            </div>

            <FixFields form={form} update={update} picked={picked} startPickRef={() => startPick('a2')} picking={picking} />

            {ops ? (
              <label className={styles.field}>
                Name of this fix
                <input
                  value={effectiveTitle}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleEdited(true);
                  }}
                  name="fix-title"
                  autoComplete="off"
                />
              </label>
            ) : null}
            {error ? <PlainError error={error} /> : null}
            <div className={styles.footer}>
              <span className="muted">{ops ? 'The preview on the left already shows this fix.' : 'Choose a fix to see it in the preview.'}</span>
              <button type="button" className="btn btn--primary" disabled={!ops} onClick={() => setStep(3)}>
                Next: prove it works
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 && picked ? (
          <div className={styles.stepBody}>
            <h2>Prove it works</h2>
            <p className={styles.lede}>A real browser will open the preview and check these things.</p>
            {suggestedChecks(form).length === 0 ? (
              <p className={styles.hint}>This kind of fix has no automatic check. The browser test still confirms it applies cleanly.</p>
            ) : (
              <ul className={styles.checks}>
                {suggestedChecks(form).map((c, i) => {
                  const off = removedChecks.includes(i);
                  return (
                    <li key={i} className={off ? styles.checkOff : undefined}>
                      <span>{cap(stepText(c))}</span>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => setRemovedChecks((r) => (off ? r.filter((x) => x !== i) : [...r, i]))}
                      >
                        {off ? 'Use' : 'Skip'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <button type="button" className="btn btn--big" disabled={busy !== null || !ops} onClick={() => void testNow()}>
              {busy === 'test' ? 'Testing in a real browser…' : 'Test it now'}
            </button>
            {run ? <RunResult run={run} /> : null}

            {error ? <PlainError error={error} /> : null}
            <div className={styles.footer}>
              {sentPatch ? (
                <span className={styles.sent}>
                  <PatchStatusChip status={sentPatch.status} /> Sent. A reviewer picks it up in Review.
                </span>
              ) : (
                <span className="muted">{effectiveTitle}</span>
              )}
              {sentPatch ? (
                <button type="button" className="btn" onClick={reset}>
                  Fix something else
                </button>
              ) : (
                <button type="button" className="btn btn--patch" disabled={busy !== null || !ops} onClick={() => void sendForReview()}>
                  {busy === 'send' ? 'Sending…' : 'Send for review'}
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className={styles.myFixes}>
          <h3>Your fixes</h3>
          {myFixes.length === 0 ? (
            <p className="muted">No fixes yet. Pick something on the page to start.</p>
          ) : (
            <ul>
              {myFixes.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <span className={styles.fixTitle}>{p.title}</span>
                  {liveIds.has(p.id) ? (
                    <Chip tone="healthy" glyph="●">live</Chip>
                  ) : (
                    <PatchStatusChip status={p.status} />
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="muted">Acting as {nameOf(team, userId)}.</p>
        </div>
      </aside>
    </div>
  );
}

function FixFields({
  form,
  update,
  picked,
  startPickRef,
  picking,
}: {
  form: FixForm;
  update: (p: Partial<FixForm>) => void;
  picked: Picked;
  startPickRef: () => void;
  picking: 'a1' | 'a2' | null;
}) {
  switch (form.kind) {
    case 'text':
      return (
        <label className={styles.field}>
          New text
          <input value={form.text} onChange={(e) => update({ text: e.target.value })} name="fix-text" autoComplete="off" />
          <span className="muted">Was: “{picked.current.text}”</span>
        </label>
      );
    case 'style':
      return (
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            What to change
            <select value={form.styleProperty} onChange={(e) => update({ styleProperty: e.target.value as FixForm['styleProperty'] })}>
              {STYLE_PRESETS.map((s) => (
                <option key={s.property} value={s.property}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            New value
            <input
              value={form.styleValue}
              onChange={(e) => update({ styleValue: e.target.value })}
              placeholder={`e.g. ${STYLE_PRESETS.find((s) => s.property === form.styleProperty)?.placeholder ?? ''}…`}
              name="fix-style"
              autoComplete="off"
            />
          </label>
        </div>
      );
    case 'attr':
      return (
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            Attribute
            <select value={form.attrName} onChange={(e) => update({ attrName: e.target.value as FixForm['attrName'] })}>
              {ATTR_CHOICES.map((a) => (
                <option key={a} value={a}>
                  {a === 'href' ? 'Link address (href)' : a}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            New value
            <input
              value={form.attrValue}
              disabled={form.attrRemove}
              onChange={(e) => update({ attrValue: e.target.value })}
              placeholder={picked.current.attrs[form.attrName] ?? 'e.g. /checkout…'}
              name="fix-attr"
              autoComplete="off"
            />
          </label>
          <label className={styles.inline}>
            <input type="checkbox" checked={form.attrRemove} onChange={(e) => update({ attrRemove: e.target.checked })} /> Remove it instead
          </label>
        </div>
      );
    case 'click':
      return (
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            When someone clicks it
            <select value={form.clickAction} onChange={(e) => update({ clickAction: e.target.value as FixForm['clickAction'] })}>
              <option value="navigate">Go to a page</option>
              <option value="block">Do nothing (stop the broken click)</option>
            </select>
          </label>
          {form.clickAction === 'navigate' ? (
            <label className={styles.field}>
              Page
              <input value={form.clickUrl} onChange={(e) => update({ clickUrl: e.target.value })} placeholder="e.g. /checkout…" name="fix-url" autoComplete="off" />
            </label>
          ) : null}
        </div>
      );
    case 'move':
      return (
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            Put it
            <select value={form.movePosition} onChange={(e) => update({ movePosition: e.target.value as FixForm['movePosition'] })}>
              <option value="before">before</option>
              <option value="after">after</option>
              <option value="prepend">inside, at the start of</option>
              <option value="append">inside, at the end of</option>
            </select>
          </label>
          <div className={styles.field}>
            Which element
            {form.moveRef ? <span>{labelOf(form.moveRef)}</span> : null}
            <button type="button" className="btn" onClick={startPickRef}>
              {picking === 'a2' ? 'Click it in the preview…' : form.moveRef ? 'Pick a different one' : 'Pick the other element'}
            </button>
          </div>
        </div>
      );
    case 'insert':
      return (
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            Message
            <input value={form.insertText} onChange={(e) => update({ insertText: e.target.value })} placeholder="e.g. Free delivery this week…" name="fix-note" autoComplete="off" />
          </label>
          <label className={styles.field}>
            Where
            <select value={form.insertPosition} onChange={(e) => update({ insertPosition: e.target.value as FixForm['insertPosition'] })}>
              <option value="beforebegin">Above it</option>
              <option value="afterend">Below it</option>
              <option value="afterbegin">Inside, at the start</option>
              <option value="beforeend">Inside, at the end</option>
            </select>
          </label>
        </div>
      );
    default:
      return null;
  }
}

function RunResult({ run }: { run: VerificationRun }) {
  const done = run.status !== 'queued' && run.status !== 'running';
  const passed = run.status === 'passed';
  // this fix's own checks in words; checks of fixes already live are summarised in one line
  const own = run.steps.filter((s) => s.patchId === 'draft');
  const others = run.steps.filter((s) => s.patchId !== 'draft');
  const othersFailed = others.filter((s) => !s.ok).length;
  return (
    <div className={`${styles.run} ${done ? (passed ? styles.runPass : styles.runFail) : ''}`} aria-live="polite">
      <strong>
        {!done ? 'Opening a real browser…' : passed ? '✓ Works in a real browser' : '✕ The browser test found a problem'}
      </strong>
      {own.length > 0 || others.length > 0 ? (
        <ul>
          {own.map((s, i) => (
            <li key={i}>
              {s.ok ? '✓' : '✕'} {cap(stepText(s.step))}
              {s.error ? <span className="muted"> {s.error}</span> : null}
            </li>
          ))}
          {others.length > 0 ? (
            <li className="muted">
              {othersFailed === 0 ? '✓' : '✕'} {others.length - othersFailed} of {others.length} checks of fixes already live
              still pass with yours added
            </li>
          ) : null}
        </ul>
      ) : null}
      {done && run.newConsoleErrors.length > 0 ? (
        <p className="muted">New errors in the page: {run.newConsoleErrors.join('; ')}</p>
      ) : null}
      {done && run.status === 'error' ? <p className="muted">{run.summary}</p> : null}
    </div>
  );
}

/** Validation errors in plain words, next to the action that caused them. */
function PlainError({ error }: { error: unknown }) {
  if (isApiClientError(error) && error.code === 'VALIDATION_FAILED' && Array.isArray(error.details)) {
    const issues = error.details as Array<{ message: string }>;
    return (
      <div className={styles.error} role="alert">
        This fix can't be saved yet:
        <ul>
          {issues.map((i, n) => (
            <li key={n}>{i.message}</li>
          ))}
        </ul>
      </div>
    );
  }
  return <ErrorNotice error={error} />;
}
