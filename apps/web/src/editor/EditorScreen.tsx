// apps/web/src/editor/EditorScreen.tsx (owner: Dev D)
// The visual editor (PLAN 13.6 step 7): pick elements in the live preview,
// author the 9 declarative op kinds, save drafts against the revision lock,
// validate, preview and submit. Everything the runtime sends arrives over the
// origin-locked bridge in src/preview/bridge.ts.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ElementFingerprint,
  Patch,
  PatchBody,
  PreviewSpec,
  Project,
  RuntimeStatus,
  ValidationResult,
  VerificationStep,
} from '@patchwork/shared';
import { api, isApiClientError } from '../api.js';
import { PREVIEW_ORIGIN } from '../env.js';
import { highlightMessage, pickStartMessage, pickStopMessage, useRuntimeBridge } from '../preview/bridge.js';
import { ErrorNotice, Notice } from '../components/Notice.js';
import { PatchStatusChip } from '../components/StatusChip.js';
import { ChecksBuilder } from './ChecksBuilder.js';
import { OpForm } from './OpForm.js';
import { OP_KINDS, type OpDraft, type OpKind, describeOp, emptyOpDraft, opDraftToOp } from './opForm.js';
import styles from './EditorScreen.module.css';

interface EditorDraft {
  patchId: string | null;
  expectedRevision: number;
  status: Patch['status'] | null;
  title: string;
  description: string;
  urlPath: string;
  anchors: Record<string, ElementFingerprint>;
  /** current text/attrs/styles per anchor, as sent with the 'picked' message */
  anchorCurrent: Record<string, { text: string; attrs: Record<string, string>; styles: Record<string, string> }>;
  anchorOrder: string[];
  ops: OpDraft[];
  checks: VerificationStep[];
  baseValues: Record<number, string | null>;
  resolverMode: 'smart' | 'selector';
  previewId: string | null;
  previewUrl: string | null;
}

function emptyDraft(path: string): EditorDraft {
  return {
    patchId: null,
    expectedRevision: 0,
    status: null,
    title: '',
    description: '',
    urlPath: path,
    anchors: {},
    anchorCurrent: {},
    anchorOrder: [],
    ops: [],
    checks: [],
    baseValues: {},
    resolverMode: 'smart',
    previewId: null,
    previewUrl: null,
  };
}

function toBody(draft: EditorDraft): PatchBody {
  return {
    urlPath: draft.urlPath,
    anchors: draft.anchors,
    ops: draft.ops.map(opDraftToOp),
    checks: draft.checks,
    baseSnapshotId: null,
    baseValues: draft.baseValues,
  };
}

/** baseValues for a new op, read from the anchor's current values (PLAN 11.3). */
function baseValueFor(draft: EditorDraft, op: OpDraft): string | null {
  const current = currentOf(draft, op.anchor);
  if (!current) return null;
  if (op.kind === 'setText') return current.text || null;
  if (op.kind === 'setAttribute') return current.attrs[op.name] ?? null;
  if (op.kind === 'setStyle') return current.styles[op.property] || null;
  return null;
}

function currentOf(draft: EditorDraft, anchorKey: string) {
  return draft.anchorCurrent[anchorKey] ?? null;
}

export function EditorScreen() {
  const [project, setProject] = useState<Project | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [opKind, setOpKind] = useState<OpKind>('setBehavior');
  const [opDraft, setOpDraft] = useState<OpDraft | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [picking, setPicking] = useState(false);

  /* --- boot: find the project, start a draft on its first tracked path ---- */
  useEffect(() => {
    let stopped = false;
    void (async () => {
      try {
        const projects = await api.projects();
        if (stopped) return;
        const first = projects.items[0] ?? null;
        setProject(first);
        setDraft(emptyDraft(first?.paths[0] ?? '/'));
      } catch (err) {
        if (!stopped) setSaveError(err);
      }
    })();
    return () => {
      stopped = true;
    };
  }, []);

  const anchorKeys = draft?.anchorOrder ?? [];

  const onPicked = useCallback(    (
      fingerprint: ElementFingerprint,
      elementPath: string,
      current: { text: string; attrs: Record<string, string>; styles: Record<string, string> },
    ) => {
      setDraft((currentDraft) => {
        if (!currentDraft) return currentDraft;
        const existing = Object.entries(currentDraft.anchors).find(
          ([, fp]) => fp.cssPath === fingerprint.cssPath,
        );
        const key = existing ? existing[0] : `a${currentDraft.anchorOrder.length + 1}`;
        void elementPath;
        return {
          ...currentDraft,
          anchors: { ...currentDraft.anchors, [key]: fingerprint },
          anchorCurrent: { ...currentDraft.anchorCurrent, [key]: current },
          anchorOrder: currentDraft.anchorOrder.includes(key)
            ? currentDraft.anchorOrder
            : [...currentDraft.anchorOrder, key],
        };
      });
      setPicking(false);
    },
    [],
  );

  const { send } = useRuntimeBridge({
    previewOrigin: PREVIEW_ORIGIN,
    onReady: (status) => setRuntimeStatus(status),
    onPicked,
  });

  /* --- preview ------------------------------------------------------------- */
  const refreshPreview = useCallback(async () => {
    if (!project || !draft) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      // A preview carries the draft only once it actually has content; before
      // that it shows head, which is the honest "nothing to preview yet" state.
      const hasContent = draft.anchorOrder.length > 0 && draft.ops.length > 0;
      const spec: PreviewSpec = {
        base: 'head',
        include: draft.patchId ? [draft.patchId] : [],
        exclude: [],
        draft: draft.patchId || !hasContent ? null : { title: draft.title || 'Untitled draft', ...toBody(draft) },
        resolverMode: draft.resolverMode,
      };
      if (draft.previewId) {
        await api.updatePreview(draft.previewId, spec);
      } else {
        const res = await api.createPreview(project.id, spec);
        setDraft((current) =>
          current ? { ...current, previewId: res.preview.id, previewUrl: res.url } : current,
        );
      }
      setSaveMessage('Preview updated.');
    } catch (err) {
      setPreviewError(err);
    } finally {
      setPreviewLoading(false);
    }
  }, [project, draft]);

  /* Open a preview as soon as the editor loads (PLAN section 10 primary flow).
     One attempt only; the button retries after a failure. */
  const [previewAttempted, setPreviewAttempted] = useState(false);
  useEffect(() => {
    if (previewAttempted || !project || !draft || draft.previewUrl) return;
    setPreviewAttempted(true);
    void refreshPreview();
  }, [previewAttempted, project, draft, refreshPreview]);

  /* --- saving --------------------------------------------------------------- */
  const saveDraft = useCallback(async () => {
    if (!project || !draft) return;
    setSaveError(null);
    setSaveMessage(null);
    const body = { title: draft.title || 'Untitled draft', description: draft.description, ...toBody(draft) };
    try {
      if (!draft.patchId) {
        const created = await api.createPatch(project.id, body);
        setDraft((current) =>
          current
            ? { ...current, patchId: created.id, expectedRevision: created.revision, status: created.status }
            : current,
        );
        setSaveMessage('Draft created.');
      } else {
        const updated = await api.updatePatch(draft.patchId, {
          expectedRevision: draft.expectedRevision,
          ...body,
        });
        setDraft((current) =>
          current ? { ...current, expectedRevision: updated.revision, status: updated.status } : current,
        );
        setSaveMessage('Draft saved.');
      }
    } catch (err) {
      if (isApiClientError(err) && err.code === 'STALE_REVISION' && draft.patchId) {
        try {
          const fresh = await api.patch(draft.patchId);
          setDraft((current) =>
            current
              ? {
                  ...current,
                  expectedRevision: fresh.revision,
                  status: fresh.status,
                  title: fresh.title,
                  description: fresh.description,
                  urlPath: fresh.urlPath,
                  anchors: current.anchors,
                  anchorOrder: current.anchorOrder,
                  ops: current.ops,
                  checks: current.checks,
                }
              : current,
          );
          setSaveMessage('Someone else saved a newer revision. Their changes are loaded — re-apply your edit.');
        } catch (reloadErr) {
          setSaveError(reloadErr);
        }
      } else {
        setSaveError(err);
      }
    }
  }, [project, draft]);

  const runValidate = useCallback(async () => {
    if (!draft?.patchId) {
      setSaveMessage('Save the draft first — validation runs on a stored patch.');
      return;
    }
    try {
      const result = await api.validatePatch(draft.patchId);
      setValidation(result);
    } catch (err) {
      setSaveError(err);
    }
  }, [draft]);

  const submitForReview = useCallback(async () => {
    if (!draft?.patchId) return;
    try {
      const updated = await api.submitPatch(draft.patchId);
      setDraft((current) => (current ? { ...current, status: updated.status, expectedRevision: updated.revision } : current));
      setSaveMessage('Submitted for review.');
    } catch (err) {
      setSaveError(err);
    }
  }, [draft]);

  /* --- render guards --------------------------------------------------------- */
  if (saveError && !draft) return <ErrorNotice error={saveError} />;
  if (!project || !draft) return <p className={styles.loading}>Loading the editor…</p>;

  const patch = (partial: Partial<EditorDraft>) =>
    setDraft((current) => (current ? { ...current, ...partial } : current));

  return (
    <section className={styles.editor}>
      <div className={styles.head}>
        <h1>Editor</h1>
        <div className={styles.meta}>
          <PatchStatusChip status={draft.status ?? 'draft'} />
          <span className="mono-id">{draft.patchId ?? 'unsaved'}</span>
          {draft.patchId ? <span className="mono-id">revision {draft.expectedRevision}</span> : null}
        </div>
      </div>

      <div className={styles.fields}>
        <label>
          Title
          <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Fix checkout button" />
        </label>
        <label>
          Path
          <input value={draft.urlPath} onChange={(e) => patch({ urlPath: e.target.value })} placeholder="/cart" />
        </label>
      </div>
      <label className={styles.description}>
        What this patch does and why
        <textarea
          value={draft.description}
          onChange={(e) => patch({ description: e.target.value })}
          rows={2}
        />
      </label>

      <div className={styles.workspace}>
        <div className={styles.previewColumn}>
          <div className={styles.previewBar}>
            <button
              className={`btn ${picking ? 'btn--primary' : ''}`}
              type="button"
              disabled={!draft.previewUrl}
              onClick={() => {
                if (picking) {
                  send(pickStopMessage(), iframeRef.current);
                  setPicking(false);
                } else {
                  send(pickStartMessage(), iframeRef.current);
                  setPicking(true);
                }
              }}
            >
              {picking ? 'Click an element…' : 'Pick element'}
            </button>
            <span className={styles.previewHint}>
              {draft.previewUrl ? 'pick in the preview, then author ops on the right' : 'preview unavailable'}
            </span>
            <button className="btn" type="button" disabled={previewLoading} onClick={() => void refreshPreview()}>
              {previewLoading ? 'Updating…' : 'Update preview'}
            </button>
          </div>

          {previewError ? <ErrorNotice error={previewError} /> : null}

          {draft.previewUrl ? (
            <iframe
              ref={iframeRef}
              className={styles.preview}
              title="Patch preview"
              src={`${draft.previewUrl}${draft.previewUrl.includes('?') ? '&' : '?'}editor=1`}
              onLoad={() => {
                send(pickStopMessage(), iframeRef.current);
                setPicking(false);
              }}
            />
          ) : (
            <div className={styles.previewEmpty}>
              <p className="prose">
                The preview opens through the gateway (:4300). Until Dev A's preview routes and Dev C's gateway
                land, this pane stays empty — authoring and saving still work.
              </p>
              <button className="btn" type="button" disabled={previewLoading} onClick={() => void refreshPreview()}>
                Try opening a preview
              </button>
            </div>
          )}

          <div className={styles.resolver}>
            Resolver in this preview:
            <label>
              <input
                type="radio"
                name="resolver"
                checked={draft.resolverMode === 'smart'}
                onChange={() => {
                  patch({ resolverMode: 'smart' });
                  void refreshPreview();
                }}
              />
              smart (multi-feature)
            </label>
            <label>
              <input
                type="radio"
                name="resolver"
                checked={draft.resolverMode === 'selector'}
                onChange={() => {
                  patch({ resolverMode: 'selector' });
                  void refreshPreview();
                }}
              />
              selector-only (baseline)
            </label>
          </div>

          {runtimeStatus ? (
            <p className={styles.runtimeStatus}>
              runtime {runtimeStatus.ready ? 'ready' : 'starting'} · manifest {runtimeStatus.manifestHash.slice(0, 8)} ·{' '}
              {runtimeStatus.patches.filter((p) => p.applied).length}/{runtimeStatus.patches.length} patches applied
            </p>
          ) : null}
        </div>

        <div className={styles.panelColumn}>
          <div className={styles.panel}>
            <h2>Anchors</h2>
            {anchorKeys.length === 0 ? (
              <p className="prose">
                No anchors yet. Press <strong>Pick element</strong> and click the broken checkout button in the preview.
              </p>
            ) : (
              <ul className={styles.anchors}>
                {anchorKeys.map((key) => {
                  const fp = draft.anchors[key];
                  return (
                    <li key={key}>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => send(highlightMessage(fp ?? null), iframeRef.current)}
                      >
                        {key}
                      </button>{' '}
                      <span className="mono-id">
                        {fp?.tag}
                        {fp?.id ? `#${fp.id}` : ''} — “{(fp?.text ?? '').slice(0, 40)}”
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              className="btn"
              type="button"
              disabled={!draft.previewUrl || picking}
              onClick={() => {
                send(pickStartMessage(), iframeRef.current);
                setPicking(true);
              }}
            >
              Pick another element
            </button>
          </div>

          <div className={styles.panel}>
            <h2>Operations</h2>
            {draft.ops.length === 0 ? (
              <p className="prose">No operations yet. Add one below — nine kinds are supported.</p>
            ) : (
              <ol className={styles.ops}>
                {draft.ops.map((op, index) => (
                  <li key={index}>
                    <span>{describeOp(op)}</span>
                    <button
                      className="btn"
                      type="button"
                      onClick={() =>
                        patch({
                          ops: draft.ops.filter((_, i) => i !== index),
                          baseValues: remapBaseValues(draft.baseValues, index),
                        })
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <div className={styles.addOp}>
              <label>
                Operation
                <select value={opKind} onChange={(e) => setOpKind(e.target.value as OpKind)}>
                  {OP_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{kind}</option>
                  ))}
                </select>
              </label>
              {opDraft && opDraft.kind === opKind ? (
                <OpForm
                  draft={opDraft}
                  anchorKeys={anchorKeys}
                  currentOf={(key) => currentOf(draft, key)}
                  onChange={setOpDraft}
                />
              ) : null}
              <button
                className="btn btn--primary"
                type="button"
                disabled={anchorKeys.length === 0}
                onClick={() => setOpDraft(emptyOpDraft(opKind, anchorKeys))}
              >
                {opDraft && opDraft.kind === opKind ? 'Restart form' : `Configure ${opKind}`}
              </button>
              {opDraft && opDraft.kind === opKind ? (
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => {
                    patch({
                      ops: [...draft.ops, opDraft],
                      baseValues: { ...draft.baseValues, [draft.ops.length]: baseValueFor(draft, opDraft) },
                    });
                    setOpDraft(null);
                    setSaveMessage('Operation added. Save the draft to keep it.');
                  }}
                >
                  Add operation
                </button>
              ) : null}
            </div>
          </div>

          <div className={styles.panel}>
            <h2>Checks</h2>
            <ChecksBuilder
              checks={draft.checks}
              anchorKeys={anchorKeys}
              onChange={(checks) => patch({ checks })}
            />
          </div>
        </div>
      </div>

      <div className={styles.saveBar}>
        <button className="btn btn--primary" type="button" onClick={() => void saveDraft()}>
          Save draft
        </button>
        <button className="btn" type="button" onClick={() => void runValidate()}>
          Validate
        </button>
        <button
          className="btn"
          type="button"
          disabled={!draft.patchId || draft.status !== 'draft'}
          onClick={() => void submitForReview()}
        >
          Submit for review
        </button>
        <button className="btn" type="button" onClick={() => void refreshPreview()}>
          Update preview
        </button>
        {saveMessage ? <span className={styles.saved}>{saveMessage}</span> : null}
        {saveError ? <span className={styles.saveError}><ErrorNotice error={saveError} /></span> : null}
      </div>

      {validation ? (
        <div className={styles.validation}>
          <h2>Validation</h2>
          {validation.issues.length === 0 ? (
            <p className="prose">No issues found.</p>
          ) : (
            <ul className={styles.issues}>
              {validation.issues.map((issue, index) => (
                <li key={index} className={issue.severity === 'error' ? styles.issueError : styles.issueWarn}>
                  <span aria-hidden="true">{issue.severity === 'error' ? '✕' : '!'}</span>{' '}
                  <span className="mono-id">{issue.path.join('.')}</span> {issue.message}{' '}
                  <span className="mono-id">({issue.code})</span>
                </li>
              ))}
            </ul>
          )}
          {validation.sanitized ? (
            <Notice tone="info" title="Sanitised">
              The sanitiser changed your HTML. Review the sanitised version before saving.
            </Notice>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Drop one baseValues entry and shift the rest down after an op is removed. */
function remapBaseValues(values: Record<number, string | null>, removedIndex: number): Record<number, string | null> {
  const next: Record<number, string | null> = {};
  for (const [key, value] of Object.entries(values)) {
    const index = Number(key);
    if (index < removedIndex) next[index] = value;
    if (index > removedIndex) next[index - 1] = value;
  }
  return next;
}
