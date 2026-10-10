import styles from './Meter.module.css';

/**
 * The confidence meter: the one place this app spends its boldness.
 * It shows why an anchor got its status — the weighted score of the best
 * candidate against the resolver's thresholds, with the runner-up marked.
 * Numbers are tabular because they are compared column-wise.
 */
export function Meter({
  confidence,
  margin,
  thresholds,
  label,
}: {
  confidence: number;
  margin: number | null;
  thresholds: { relocate: number; exact: number };
  label: string;
}) {
  const pct = (value: number) => `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  const runnerUp = margin === null ? null : Math.max(0, confidence - margin);
  const status = confidence >= thresholds.exact
    ? 'meets exact'
    : confidence >= thresholds.relocate
      ? 'meets relocate'
      : 'below relocate';

  return (
    <div
      className={styles.meter}
      role="img"
      aria-label={`${label}: confidence ${confidence.toFixed(2)}, ${status}. Relocate threshold ${thresholds.relocate.toFixed(2)}, exact threshold ${thresholds.exact.toFixed(2)}.${margin === null ? '' : ` Runner-up margin ${margin.toFixed(2)}.`}`}
    >
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: pct(confidence) }} />
        {runnerUp !== null && runnerUp > 0 ? (
          <div className={styles.runnerUp} style={{ left: pct(runnerUp) }} aria-hidden="true" />
        ) : null}
        <div className={styles.threshold} style={{ left: pct(thresholds.relocate) }} aria-hidden="true" />
        <div className={`${styles.threshold} ${styles.thresholdExact}`} style={{ left: pct(thresholds.exact) }} aria-hidden="true" />
      </div>
      <span className={`${styles.value} num`}>{confidence.toFixed(2)}</span>
    </div>
  );
}
