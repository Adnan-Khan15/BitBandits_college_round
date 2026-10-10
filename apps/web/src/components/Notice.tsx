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

/** Plain titles for error codes: the code itself is for developers, not for people on screen. */
const ERROR_TITLE: Record<string, string> = {
  VALIDATION_FAILED: 'Please check this',
  FORBIDDEN: 'Not allowed',
  NOT_FOUND: 'Not found',
  INVALID_STATE: "Can't do that right now",
  STALE_REVISION: 'Someone else changed this first',
  MERGE_BLOCKED: 'Merge blocked by a conflict',
  VERIFICATION_REQUIRED: 'Needs a passing browser test first',
  UPSTREAM_UNREACHABLE: "The site isn't reachable",
  NOT_IMPLEMENTED: 'Not available in this build',
  NETWORK: "Can't reach PATCHWORK",
  BAD_RESPONSE: 'Unexpected answer from PATCHWORK',
};

export function ErrorNotice({ error }: { error: unknown }) {
  if (isApiClientError(error)) {
    return (
      <Notice tone="error" title={ERROR_TITLE[error.code] ?? 'Something went wrong'}>
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
