import type { ReactNode } from 'react';
import styles from './Notice.module.css';
import { isApiClientError } from '../api.js';

/**
 * Errors say what happened and how to fix it, in the interface's voice
 * (frontend-design writing rules). The server's requestId is shown small:
 * it is the handle for a bug report, not decoration.
 */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'error' | 'empty';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`${styles.notice} ${styles[tone]}`} role={tone === 'error' ? 'alert' : undefined}>
      <div>
        {title ? <strong className={styles.title}>{title}</strong> : null}
        <div className={styles.body}>{children}</div>
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (isApiClientError(error)) {
    return (
      <Notice tone="error" title={`${error.code}`}>
        {error.message}
        {error.requestId ? <span className={styles.requestId}>request {error.requestId}</span> : null}
      </Notice>
    );
  }
  return (
    <Notice tone="error" title="Unexpected error">
      {error instanceof Error ? error.message : String(error)}
    </Notice>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Notice tone="empty" action={action}>
      {children}
    </Notice>
  );
}
