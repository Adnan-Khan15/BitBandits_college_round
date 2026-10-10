import type { VerificationStep } from '@patchwork/shared';
import styles from './ChecksBuilder.module.css';

const ACTIONS: Array<{ action: VerificationStep['action']; label: string }> = [
  { action: 'goto', label: 'go to' },
  { action: 'click', label: 'click' },
  { action: 'fill', label: 'fill' },
  { action: 'expectText', label: 'expect text' },
  { action: 'expectVisible', label: 'expect visible' },
  { action: 'expectHidden', label: 'expect hidden' },
  { action: 'expectUrl', label: 'expect URL contains' },
];

/** "anchor:<key>" is resolved by the runtime at verification time (PLAN 11.7). */

export function ChecksBuilder({
  checks,
  anchorKeys,
  onChange,
}: {
  checks: VerificationStep[];
  anchorKeys: string[];
  onChange: (checks: VerificationStep[]) => void;
}) {
  const update = (index: number, step: VerificationStep) => {
    const next = [...checks];
    next[index] = step;
    onChange(next);
  };

  return (
    <div className={styles.builder}>
      {checks.length === 0 ? (
        <p className={styles.hint}>No checks yet. A check proves the patch still behaves after deploy.</p>
      ) : null}
      {checks.map((step, index) => (
        <div className={styles.row} key={index}>
          <select
            value={step.action}
            aria-label={`Check ${index + 1} action`}
            onChange={(e) => {
              const action = e.target.value as VerificationStep['action'];
              update(index, defaultStep(action));
            }}
          >
            {ACTIONS.map((a) => (
              <option key={a.action} value={a.action}>{a.label}</option>
            ))}
          </select>

          {step.action === 'goto' ? (
            <input
              value={step.path}
              aria-label="Path"
              placeholder="/cart"
              onChange={(e) => update(index, { action: 'goto', path: e.target.value })}
            />
          ) : null}

          {step.action === 'click' || step.action === 'expectVisible' || step.action === 'expectHidden' ? (
            <TargetInput
              label={step.action === 'click' ? 'Click' : 'Element'}
              value={'target' in step ? step.target : ''}
              anchorKeys={anchorKeys}
              onChange={(target) => update(index, { ...step, target } as VerificationStep)}
            />
          ) : null}

          {step.action === 'fill' ? (
            <>
              <TargetInput label="Field" value={step.target} anchorKeys={anchorKeys} onChange={(target) => update(index, { action: 'fill', target, value: step.value })} />
              <input value={step.value} aria-label="Value" onChange={(e) => update(index, { action: 'fill', target: step.target, value: e.target.value })} />
            </>
          ) : null}

          {step.action === 'expectText' ? (
            <>
              <TargetInput label="Element" value={step.target} anchorKeys={anchorKeys} onChange={(target) => update(index, { action: 'expectText', target, contains: step.contains })} />
              <input value={step.contains} aria-label="Contains" onChange={(e) => update(index, { action: 'expectText', target: step.target, contains: e.target.value })} />
            </>
          ) : null}

          {step.action === 'expectUrl' ? (
            <input
              value={step.contains}
              aria-label="URL contains"
              placeholder="/checkout"
              onChange={(e) => update(index, { action: 'expectUrl', contains: e.target.value })}
            />
          ) : null}

          <button className="btn" type="button" onClick={() => onChange(checks.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      <button className="btn" type="button" onClick={() => onChange([...checks, defaultStep('expectText')])}>
        Add check
      </button>
    </div>
  );
}

function TargetInput({
  label,
  value,
  anchorKeys,
  onChange,
}: {
  label: string;
  value: string;
  anchorKeys: string[];
  onChange: (value: string) => void;
}) {
  return (
    <>
      <input
        value={value}
        aria-label={label}
        placeholder="#checkout-btn or anchor:a1"
        onChange={(e) => onChange(e.target.value)}
      />
      {anchorKeys.length > 0 ? (
        <span className={styles.anchors}>
          {anchorKeys.map((key) => (
            <button key={key} className={styles.anchorChip} type="button" onClick={() => onChange(`anchor:${key}`)}>
              {key}
            </button>
          ))}
        </span>
      ) : null}
    </>
  );
}

function defaultStep(action: VerificationStep['action']): VerificationStep {
  switch (action) {
    case 'goto':
      return { action: 'goto', path: '/cart' };
    case 'click':
      return { action: 'click', target: 'anchor:a1' };
    case 'fill':
      return { action: 'fill', target: 'anchor:a1', value: '' };
    case 'expectText':
      return { action: 'expectText', target: 'anchor:a1', contains: '' };
    case 'expectVisible':
      return { action: 'expectVisible', target: 'anchor:a1' };
    case 'expectHidden':
      return { action: 'expectHidden', target: 'anchor:a1' };
    case 'expectUrl':
      return { action: 'expectUrl', contains: '/checkout' };
  }
}
