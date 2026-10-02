import assert from 'node:assert/strict';
import {mkdtemp, cp, mkdir, copyFile, symlink, readdir, readFile} from 'node:fs/promises';
import {resolve, join, dirname, basename} from 'node:path';
import {tmpdir} from 'node:os';

// Reproduce a managed deployment: compiled output and traced assets, no source scripts.
export async function createRuntimePackage() {
  const root = process.cwd();
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
  const runtime = await mkdtemp(join(tmpdir(), 'rv360-runtime-'));
  await cp(resolve('.next'), join(runtime, '.next'), {
    recursive:true, filter: path => !['cache', 'dev', 'standalone'].includes(basename(path)),
  });
  for (const file of ['database/mysql.sql', 'database/sqlite.sql',
    'lib/server/data/ecuador-offer.json', 'public/data/education-catalog.json',
    'public/media/brain-book-icon.png', '.runtime/import-worker.cjs']) {
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
