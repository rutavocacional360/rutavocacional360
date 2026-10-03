import assert from 'node:assert/strict';
import {mkdtemp, cp, mkdir, copyFile, symlink, readdir, readFile} from 'node:fs/promises';
import {resolve, join, dirname, basename} from 'node:path';
import {tmpdir} from 'node:os';

// Reproduce a managed deployment: compiled output and traced assets, no source scripts.
export async function createRuntimePackage() {
  const root = process.cwd();
  const pdfjsVersion = JSON.parse(await readFile(resolve('node_modules/pdfjs-dist/package.json'), 'utf8')).version;
  const traced = new Set();
  async function scan(folder) {
    for (const entry of await readdir(folder, {withFileTypes:true})) {
      const path = join(folder, entry.name);
      if (entry.isDirectory() && !['cache', 'dev', 'standalone'].includes(entry.name)) await scan(path);
      else if (entry.name.endsWith('.nft.json')) {
        const manifest = JSON.parse(await readFile(path, 'utf8'));
        for (const file of manifest.files) traced.add(resolve(dirname(path), file));
      }
    }
  }
  await scan(resolve('.next'));
  const workerFiles = JSON.parse(await readFile(resolve('.runtime/import-worker.files.json'), 'utf8'));
  for (const file of workerFiles) {
    assert(traced.has(resolve(file)), 'Deployment trace must include import dependency '+file);
  }
  const runtime = await mkdtemp(join(tmpdir(), 'rv360-runtime-'));
  await cp(resolve('.next'), join(runtime, '.next'), {
    recursive:true, filter: path => !['cache', 'dev', 'standalone'].includes(basename(path)),
  });
  // Next serves public assets separately from server file traces. Include the
  // complete public directory, as the deployment does, so browser QA can load
  // login images, videos, icons and downloadable catalog resources as well.
  await cp(resolve('public'), join(runtime, 'public'), {recursive:true});
  for (const file of ['database/mysql.sql', 'database/sqlite.sql',
    'lib/server/data/ecuador-offer.json', 'public/data/education-catalog.json',
    'public/media/brain-book-icon.png', `public/vendor/pdfjs-${pdfjsVersion}.worker.js`,
    '.runtime/import-worker.cjs', '.runtime/import-worker.files.json']) {
    const source = resolve(file);
    assert(traced.has(source), 'Deployment trace must include '+file);
    await mkdir(dirname(join(runtime,file)), {recursive:true});
    await copyFile(source, join(runtime, file));
  }
  await copyFile(resolve('package.json'), join(runtime, 'package.json'));
  await copyFile(resolve('next.config.mjs'), join(runtime, 'next.config.mjs'));
  // Reuse installed dependencies; application source and private env files are absent.
  await symlink(join(root, 'node_modules'), join(runtime, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  return runtime;
}
