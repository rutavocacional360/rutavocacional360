import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

const root = process.cwd();
await mkdir(resolve('.qa-tools'), {recursive: true});
const folder = await mkdtemp(resolve('.qa-tools', 'import-worker-exit-'));
process.env.DB_DRIVER = 'sqlite';
process.env.DATABASE_PATH = join(folder, 'worker_test.sqlite');
process.env.IMPORT_PATH = join(folder, 'imports');
await mkdir(process.env.IMPORT_PATH);
await mkdir(join(folder, '.runtime'));
const outfile = join(folder, 'server.cjs');
await build({
  stdin: {contents: "export {db,put,document} from './lib/server/store'; export {startJob} from './lib/server/import-jobs';", resolveDir: root, loader: 'ts'},
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile,
  plugins: [{name: 'server-only', setup(b) {
    b.onResolve({filter: /^server-only$/}, () => ({path: 'empty', namespace: 'empty'}));
    b.onLoad({filter: /.*/, namespace: 'empty'}, () => ({contents: ''}));
  }}],
});
const {db, put, document, startJob} = createRequire(import.meta.url)(outfile);
const owner = 'institution:worker-exit-fixture';
const logs = [], originalError = console.error;
console.error = (...args) => logs.push(args);
async function run(id, worker) {
  await writeFile(join(folder, '.runtime/import-worker.cjs'), worker);
  await writeFile(join(process.env.IMPORT_PATH, id), '<h1>Fixture</h1>');
  await put(owner, 'rv360:imports', [{id, name: 'fixture.html', educationLevel: 'universidad', status: 'Pendiente'}]);
  await startJob(owner, id);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const [job] = await document(owner, 'rv360:imports', []);
    if (['Completado', 'Error'].includes(job.status)) {
      // The terminal write must also release capacity for the next import.
      await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
      assert.equal(globalThis.rutaJobs.size, 0);
      return job;
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 25));
  }
  assert.fail('Worker termination must leave a recoverable terminal state');
}
try {
  await db.migrate();
  process.chdir(folder);
  const dependency = await run('dependency', "process.once('message', () => require('private-fixture-missing-dependency'));");
  assert.equal(dependency.errorCode, 'IMPORT_DEPENDENCY_MISSING');
  assert.match(dependency.error, /Actualiza el despliegue/);
  const interrupted = await run('interrupted', "process.once('message', () => process.exit(1));");
  assert.equal(interrupted.errorCode, 'IMPORT_WORKER_INTERRUPTED');
  assert.match(interrupted.error, /Reintenta con el mismo documento/);
  // Simulate Node's fatal diagnostic without exhausting the test machine's RAM.
  const memory = await run('memory', "process.once('message', () => process.stderr.write('FATAL ERROR: Allocation failed - JavaScript heap out of memory\\nprivate-fixture-document-text', () => process.exit(1)));");
  assert.equal(memory.errorCode, 'IMPORT_WORKER_MEMORY_LIMIT');
  assert.match(memory.error, /memoria disponible/);
  for (const job of [dependency, interrupted, memory]) {
    assert(!JSON.stringify(job).includes(folder), 'Never expose deployment paths');
    assert(!JSON.stringify(job).includes('private-fixture'), 'Never expose raw stderr');
  }
  const completed = await run('completed', "process.once('message', () => process.send({result: {text: 'a'.repeat(700000), tests: [], warnings: []}}, () => { process.disconnect(); process.exit(0); }));");
  assert.equal(completed.status, 'Completado', 'A flushed result must win over process termination');
  assert.equal(completed.text.length, 700000);
  assert.equal(logs.length, 3, 'Only unexpected exits produce diagnostics');
  assert(!JSON.stringify(logs).includes('private-fixture'), 'Logs must omit raw document/dependency details');
  assert(!JSON.stringify(logs).includes(folder), 'Logs must omit internal paths');
} finally {
  console.error = originalError;
  process.chdir(root);
  for (const child of globalThis.rutaJobs?.values() || []) child.kill();
  await db.close();
}
console.log('PASS import worker exits: missing dependencies, interrupted extraction, memory exhaustion, private diagnostics, released capacity and complete large results.');
