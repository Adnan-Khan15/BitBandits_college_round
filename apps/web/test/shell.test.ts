// apps/web/test/shell.test.ts (owner: Dev A) - scaffold smoke test; Dev D replaces these.
import { describe, expect, it } from 'vitest';

describe('web scaffold', () => {
  it('has the vite dev-server proxy contract for /api', async () => {
    const config = await import('../vite.config.js');
    const cfg = config.default as { server: { port: number; proxy: Record<string, string> } };
    expect(cfg.server.port).toBe(5173);
    expect(cfg.server.proxy['/api']).toBe('http://localhost:4000');
  });
});
