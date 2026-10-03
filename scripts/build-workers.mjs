import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { glob, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { nodeFileTrace } = require('next/dist/compiled/@vercel/nft');
await build({entryPoints:['scripts/import-worker.mjs'],outfile:'.runtime/import-worker.cjs',bundle:true,platform:'node',target:'node24',format:'cjs',packages:'external',logLevel:'warning'});

// Next's tracing includes copy a forked worker, but do not follow its imports.
// Trace its dependencies separately, including the OCR worker's dynamic entry.
const { fileList } = await nodeFileTrace([
  '.runtime/import-worker.cjs',
  require.resolve('tesseract.js/src/worker-script/node/index.js'),
], { base: process.cwd(), processCwd: process.cwd(), mixedModules: true });
// These assets are selected at runtime and cannot all be inferred statically.
for await (const file of glob([
  'node_modules/tesseract.js-core/*.wasm',
  'node_modules/tesseract.js-core/*.wasm.js',
  'node_modules/pdfjs-dist/package.json',
  'node_modules/pdfjs-dist/legacy/build/*.mjs',
  'node_modules/pdfjs-dist/wasm/**/*',
  'node_modules/pdfjs-dist/standard_fonts/**/*',
  'node_modules/pdfjs-dist/cmaps/**/*',
], { exclude: ['**/*.map'] })) fileList.add(file);
const files = [...new Set([...fileList].map(file => file.replaceAll('\\', '/')))].sort();
await writeFile('.runtime/import-worker.files.json', JSON.stringify(files));
