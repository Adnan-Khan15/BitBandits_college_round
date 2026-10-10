// OWNER: Dev B - runtime bundle (docs/PLAN.md sections 10, 11.6, 13.4)
// esbuild bundle: packages/runtime/src -> dist/patchwork-runtime.js
// One self-contained IIFE file, no config, no Node imports.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const sharedSrc = join(repoRoot, 'packages', 'shared', 'src');
const outfile = join(here, 'dist', 'patchwork-runtime.js');

mkdirSync(dirname(outfile), { recursive: true });

// The @patchwork/shared barrel re-exports schemas.ts, which imports zod.
// The browser runtime must never bundle zod (PLAN 10 size budget, PLAN 11.17),
// so alias the barrel to a browser-safe re-export of the value modules only.
const shim = join(here, 'dist', '_shared.browser.js');
writeFileSync(
  shim,
  [
    `export * from ${JSON.stringify(join(sharedSrc, 'types.js'))};`,
    `export * from ${JSON.stringify(join(sharedSrc, 'constants.js'))};`,
    `export * from ${JSON.stringify(join(sharedSrc, 'errors.js'))};`,
    `export * from ${JSON.stringify(join(sharedSrc, 'api.js'))};`,
    `export * from ${JSON.stringify(join(sharedSrc, 'services.js'))};`,
  ].join('\n'),
);

try {
  await build({
    entryPoints: [join(here, 'src', 'runtime.ts')],
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    sourcemap: false,
    logLevel: 'info',
    alias: { '@patchwork/shared': shim },
  });
} finally {
  rmSync(shim, { force: true });
}

console.log(`[runtime] built ${outfile}`);
