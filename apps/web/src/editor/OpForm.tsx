import type { AttributeName, StyleProperty } from '@patchwork/shared';
import { ATTRIBUTE_ALLOWLIST, STYLE_ALLOWLIST } from '@patchwork/shared';
import type { ActionDraft, OpDraft } from './opFormModel.js';
import styles from './OpForm.module.css';

type Current = { text: string; attrs: Record<string, string>; styles: Record<string, string> };

interface FormProps<T extends OpDraft> {
  draft: T;
  anchorKeys: string[];
  current?: Current | null;
  onChange: (draft: T) => void;
}

function AnchorSelect({ draft, anchorKeys, onChange }: { draft: { anchor: string }; anchorKeys: string[]; onChange: (anchor: string) => void }) {
  return (
    <label>
      Element
      <select value={draft.anchor} onChange={(e) => onChange(e.target.value)}>
        {anchorKeys.length === 0 ? <option value="">pick an element first</option> : null}
        {anchorKeys.map((key) => (
          <option key={key} value={key}>{key}</option>
        ))}
      </select>
    </label>
  );
}

function SetTextForm({ draft, anchorKeys, current, onChange }: FormProps<Extract<OpDraft, { kind: 'setText' }>>) {
  return (
    <>
      <AnchorSelect draft={draft} anchorKeys={anchorKeys} onChange={(anchor) => onChange({ ...draft, anchor })} />
      <label>
        New text
        <textarea value={draft.value} maxLength={2000} onChange={(e) => onChange({ ...draft, value: e.target.value })} />
      </label>
      {current ? <p className={styles.hint}>was “{current.text || '(empty)'}”</p> : null}
    </>
  );
}

function AttributeForm({ draft, anchorKeys, current, onChange }: FormProps<Extract<OpDraft, { kind: 'setAttribute' | 'removeAttribute' }>>) {
  const isSet = draft.kind === 'setAttribute';
  return (
    <>
      <AnchorSelect draft={draft} anchorKeys={anchorKeys} onChange={(anchor) => onChange({ ...draft, anchor } as typeof draft)} />
      <label>
        Attribute
        <select value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value as AttributeName } as typeof draft)}>
          {ATTRIBUTE_ALLOWLIST.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </label>
      {isSet ? (
        <label>
          Value
          <input
            value={(draft as Extract<OpDraft, { kind: 'setAttribute' }>).value}
            onChange={(e) => onChange({ ...(draft as Extract<OpDraft, { kind: 'setAttribute' }>), value: e.target.value })}
          />
        </label>
      ) : null}
      {current && current.attrs[draft.name] !== undefined ? (
        <p className={styles.hint}>was “{current.attrs[draft.name]}”</p>
      ) : null}
    </>
  );
}

function SetStyleForm({ draft, anchorKeys, current, onChange }: FormProps<Extract<OpDraft, { kind: 'setStyle' }>>) {
  return (
    <>
      <AnchorSelect draft={draft} anchorKeys={anchorKeys} onChange={(anchor) => onChange({ ...draft, anchor })} />
      <label>
        Property
        <select value={draft.property} onChange={(e) => onChange({ ...draft, property: e.target.value as StyleProperty })}>
          {STYLE_ALLOWLIST.map((prop) => (
            <option key={prop} value={prop}>{prop}</option>
          ))}
        </select>
      </label>
      <label>
        Value
        <input value={draft.value} onChange={(e) => onChange({ ...draft, value: e.target.value })} />
      </label>
      {current?.styles[draft.property] ? (
        <p className={styles.hint}>computed now: {current.styles[draft.property]}</p>
      ) : null}
    </>
  );
}

function VisibilityForm({ draft, anchorKeys, onChange }: FormProps<Extract<OpDraft, { kind: 'hide' | 'show' }>>) {
  return (
    <>
      <AnchorSelect draft={draft} anchorKeys={anchorKeys} onChange={(anchor) => onChange({ ...draft, anchor } as typeof draft)} />
      <p className={styles.hint}>
        {draft.kind === 'hide' ? 'Hides the element (display: none).' : 'Reverses a hide.'}
      </p>
    </>
  );
}

function MoveForm({ draft, anchorKeys, onChange }: FormProps<Extract<OpDraft, { kind: 'move' }>>) {
  return (
    <>
      <AnchorSelect draft={draft} anchorKeys={anchorKeys} onChange={(anchor) => onChange({ ...draft, anchor })} />
      <label>
        Position
        <select value={draft.position} onChange={(e) => onChange({ ...draft, position: e.target.value as 'before' | 'after' | 'prepend' | 'append' })}>
          <option value="before">before</option>
          <option value="after">after</option>
          <option value="prepend">prepend (first child)</option>
          <option value="append">append (last child)</option>
        </select>
      </label>
      <label>
        Reference element
        <select value={draft.reference} onChange={(e) => onChange({ ...draft, reference: e.target.value })}>
          <option value="">pick a reference</option>
          {anchorKeys.filter((key) => key !== draft.anchor).map((key) => (
            <option key={key} value={key}>{key}</option>
          ))}
        </select>
      </label>
      <p className={styles.hint}>Pick both elements, then say where the first goes.</p>
    </>
  );
}

function InsertHtmlForm({ draft, anchorKeys, onChange }: FormProps<Extract<OpDraft, { kind: 'insertHTML' }>>) {
  return (
    <>
      <AnchorSelect draft={draft} anchorKeys={anchorKeys} onChange={(anchor) => onChange({ ...draft, anchor })} />
      <label>
        Position
        <select value={draft.position} onChange={(e) => onChange({ ...draft, position: e.target.value as 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend' })}>
          <option value="beforebegin">beforebegin (outside, before)</option>
          <option value="afterbegin">afterbegin (inside, first)</option>
          <option value="beforeend">beforeend (inside, last)</option>
          <option value="afterend">afterend (outside, after)</option>
        </select>
      </label>
      <label>
        HTML (sanitised on save; no scripts)
        <textarea value={draft.html} maxLength={10240} onChange={(e) => onChange({ ...draft, html: e.target.value })} />
      </label>
    </>
  );
}

function BehaviorForm({ draft, anchorKeys, onChange }: FormProps<Extract<OpDraft, { kind: 'setBehavior' }>>) {
  const action: ActionDraft = draft.action;
  return (
    <>
      <AnchorSelect draft={draft} anchorKeys={anchorKeys} onChange={(anchor) => onChange({ ...draft, anchor })} />
      <label>
        Event
        <select value={draft.event} onChange={(e) => onChange({ ...draft, event: e.target.value as 'click' | 'submit' })}>
          <option value="click">click</option>
          <option value="submit">submit</option>
        </select>
      </label>
      <label>
        Mode
        <select value={draft.mode} onChange={(e) => onChange({ ...draft, mode: e.target.value as 'replace' | 'before' })}>
          <option value="replace">replace — the site's handler never runs</option>
          <option value="before">before — run alongside it</option>
        </select>
      </label>
      <label>
        Action
        <select
          value={action.type}
          onChange={(e) => {
            const type = e.target.value as ActionDraft['type'];
            const next: ActionDraft =
              type === 'navigate' ? { type, url: '' }
              : type === 'preventDefault' ? { type }
              : type === 'clickTarget' ? { type, target: anchorKeys[0] ?? '' }
              : type === 'toggleAttribute' ? { type, target: anchorKeys[0] ?? '', name: 'aria-disabled' }
              : { type, target: anchorKeys[0] ?? '' };
            onChange({ ...draft, action: next });
          }}
        >
          <option value="navigate">navigate to a URL</option>
          <option value="preventDefault">prevent default</option>
          <option value="clickTarget">click another element</option>
          <option value="toggleAttribute">toggle an attribute</option>
          <option value="submitForm">submit a form</option>
        </select>
      </label>
      {action.type === 'navigate' ? (
        <label>
          URL (relative or http(s))
          <input value={action.url} onChange={(e) => onChange({ ...draft, action: { type: 'navigate', url: e.target.value } })} />
        </label>
      ) : null}
      {action.type === 'clickTarget' || action.type === 'submitForm' ? (
        <label>
          Target element
          <select value={action.target} onChange={(e) => onChange({ ...draft, action: { ...action, target: e.target.value } })}>
            {anchorKeys.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
        </label>
      ) : null}
      {action.type === 'toggleAttribute' ? (
        <label>
          Attribute
          <select
            value={action.name}
            onChange={(e) => onChange({ ...draft, action: { type: 'toggleAttribute', target: action.target, name: e.target.value as AttributeName } })}
          >
            {ATTRIBUTE_ALLOWLIST.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      ) : null}
    </>
  );
}

export function OpForm({ draft, anchorKeys, currentOf, onChange }: {
  draft: OpDraft;
  anchorKeys: string[];
  currentOf: (anchorKey: string) => Current | null;
  onChange: (draft: OpDraft) => void;
}) {
  const current = currentOf(draft.anchor);
  return (
    <div className={styles.form}>
      <div className={styles.row}>
        {draft.kind === 'setText' ? (
          <SetTextForm draft={draft} anchorKeys={anchorKeys} current={current} onChange={onChange} />
        ) : null}
        {draft.kind === 'setAttribute' || draft.kind === 'removeAttribute' ? (
          <AttributeForm draft={draft} anchorKeys={anchorKeys} current={current} onChange={onChange} />
        ) : null}
        {draft.kind === 'setStyle' ? (
          <SetStyleForm draft={draft} anchorKeys={anchorKeys} current={current} onChange={onChange} />
        ) : null}
        {draft.kind === 'hide' || draft.kind === 'show' ? (
          <VisibilityForm draft={draft} anchorKeys={anchorKeys} onChange={onChange} />
        ) : null}
        {draft.kind === 'move' ? (
          <MoveForm draft={draft} anchorKeys={anchorKeys} onChange={onChange} />
        ) : null}
        {draft.kind === 'insertHTML' ? (
          <InsertHtmlForm draft={draft} anchorKeys={anchorKeys} onChange={onChange} />
        ) : null}
        {draft.kind === 'setBehavior' ? (
          <BehaviorForm draft={draft} anchorKeys={anchorKeys} onChange={onChange} />
        ) : null}
      </div>
    </div>
  );
}

export function OpKindLabel({ kind }: { kind: string }) {
  return <span className={styles.kind}>{kind}</span>;
}
