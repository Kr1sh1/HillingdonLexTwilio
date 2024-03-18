require('esbuild').build({
  entryPoints: ['./functions/*.ts'],
  bundle: true,
  platform: 'node',
  outdir: 'compiled',
  sourcemap: true,
  target: 'node18',
  packages: 'external',
  format: 'cjs'
})
