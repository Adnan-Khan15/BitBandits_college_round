// packages/runtime/src/beacon.ts
// Batched runtime beacons (PLAN 11.6, 11.17). No Node imports.

import type { BeaconEvent, BeaconPayload, RuntimeManifest } from '@patchwork/shared';
import { LIMITS } from '@patchwork/shared';

export interface Beacon {
  push(event: BeaconEvent): void;
  flush(): void;
  stop(): void;
}

const BEACON_INTERVAL_MS = 2_000;

export function createBeacon(manifest: RuntimeManifest): Beacon {
  let queue: BeaconEvent[] = [];

  const send = (): void => {
    if (queue.length === 0) return;
    const events = queue;
    queue = [];
    const payload: BeaconPayload = {
      channel: manifest.channel,
      projectId: manifest.projectId,
      releaseId: manifest.releaseId,
      previewId: manifest.previewId,
      path: typeof location !== 'undefined' ? location.pathname : '/',
      events,
    };
    let body: string;
    try {
      body = JSON.stringify(payload);
    } catch {
      return;
    }
    if (body.length > LIMITS.beaconPayloadMaxBytes) return;
    const url = manifest.beaconUrl;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        return;
      }
    } catch {
      /* fall through to fetch */
    }
    try {
      void fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      });
    } catch {
      /* beacon delivery is best-effort */
    }
  };

  const timer = setInterval(send, BEACON_INTERVAL_MS);

  return {
    push(event: BeaconEvent): void {
      queue.push(event);
    },
    flush: send,
    stop(): void {
      clearInterval(timer);
      send();
    },
  };
}
