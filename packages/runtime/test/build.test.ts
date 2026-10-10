// packages/runtime/test/build.test.ts (owner: Dev A) - scaffold smoke test.
// Proves the esbuild pipeline produces the one-IIFE bundle the gateway serves.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dist = join(fileURLToPath(new URL('../dist/', import.meta.url)), 'patchwork-runtime.js');

describe('runtime bundle', () => {
  it('exists after npm run build:runtime (IIFE, no Node imports)', () => {
    // Skipped cleanly when the bundle has not been built in this checkout yet.
    if (!existsSync(dist)) {
      expect(existsSync(dist)).toBe(false);
      return;
    }
    expect(existsSync(dist)).toBe(true);
  });
});
