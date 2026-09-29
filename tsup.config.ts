import { defineConfig } from 'tsup';

/**
 * Dual ESM + CJS build (ADR-11, revised).
 *
 * `tsc` cannot emit CommonJS under `moduleResolution: "node16"` while our
 * peer `@nestjs/*` is ESM-only, so a bundler produces both formats plus
 * declarations. Peer dependencies stay external.
 */
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  outDir: 'dist',
  target: 'node20',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
