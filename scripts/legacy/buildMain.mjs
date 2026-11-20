import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: { index: 'src/main/index.js', preload: 'src/main/preload.js' },
  outdir: 'build/legacy/main',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node16.17',
  external: ['electron', 'exceljs'],
  alias: { 'node:sqlite': './src/main/database/legacySqlite.cjs' },
  logLevel: 'info',
});
