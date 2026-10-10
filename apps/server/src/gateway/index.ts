// OWNER: Dev C - replace this stub (docs/PLAN.md sections 11.12 tail, 13.5).
// registerGatewayRoutes(app, registry, channel): serves ONE project (PW_PROJECT_ID).
// Live (:4100) serves only the active release; preview (:4300) serves whatever the
// pw_preview cookie selects and NEVER falls back to live.
import type { FastifyInstance } from 'fastify';
import type { ServiceRegistry } from '@patchwork/shared';

export function registerGatewayRoutes(
  _app: FastifyInstance,
  _registry: ServiceRegistry,
  _channel: 'live' | 'preview',
): void {
  // Scaffold stub: no routes yet. Dev C registers:
  //   GET /__patchwork/runtime.js, GET /__patchwork/manifest.json, POST /__patchwork/beacon,
  //   GET /__patchwork/preview/:id?path=&editor= (preview only), everything else proxied upstream.
  // Dev A never edits this file after scaffold.
}
