// OWNER: Dev B - replace this stub (docs/PLAN.md sections 10, 13.4)
// esbuild bundle: packages/runtime/src -> dist/patchwork-runtime.js (one IIFE file, no config).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = join(here, 'dist', 'patchwork-runtime.js');

mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [join(here, 'src', 'runtime.ts')],
  outfile,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: false,
  logLevel: 'info',
});

console.log(`[runtime] built ${outfile}`);
