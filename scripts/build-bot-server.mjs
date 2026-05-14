import { build } from 'esbuild';

await build({
  entryPoints: ['server/productionServer.ts'],
  outfile: 'dist-server/bot-server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: false,
  logLevel: 'info',
  external: ['vite'],
});
