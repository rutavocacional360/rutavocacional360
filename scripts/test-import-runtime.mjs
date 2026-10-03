import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, readFile, rename, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import JSZip from 'jszip';
import {jsPDF} from 'jspdf';
import './build-workers.mjs';

const root = process.cwd();
// No ancestor has access to the project's node_modules: dependencies must be
// present in the package itself, as on a managed deployment using file traces.
const runtime = await mkdtemp(join(tmpdir(), 'rv360-import-runtime-'));
await mkdir(join(runtime, '.runtime'));
await copyFile(resolve('.runtime/import-worker.cjs'), join(runtime, '.runtime/import-worker.cjs'));
const html = '<h1>Intereses académicos</h1><fieldset><legend>¿Te gusta investigar?</legend><label><input type="radio">Sí</label><label><input type="radio">No</label></fieldset>';

function runWorker(bytes, name, educationLevel = 'bachillerato') {
  return new Promise((resolveResult, reject) => {
    const child = fork(join(runtime, '.runtime/import-worker.cjs'), [], {
      cwd: runtime, env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP},
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: ['--max-old-space-size=512'], windowsHide: true,
    });
    let terminal, diagnostic = '';
    const timeout = setTimeout(() => {child.kill(); reject(new Error('Isolated import worker timed out'));}, 30_000);
    child.stderr.on('data', chunk => {diagnostic = (diagnostic + chunk).slice(-2000);});
    child.on('message', message => {if (message.result || message.error) terminal = message;});
    child.once('error', error => {clearTimeout(timeout); reject(error);});
    child.once('exit', () => {
      clearTimeout(timeout);
      if (terminal) resolveResult(terminal);
      else reject(new Error('Worker exited without a result: ' + diagnostic));
    });
    child.send({data: bytes.toString('base64'), name, educationLevel}, error => {
      if (error) {clearTimeout(timeout); child.kill(); reject(error);}
    });
  });
}

// Previously this exited before the message handler with MODULE_NOT_FOUND,
// producing only "La extracción se interrumpió" in the administrative dialog.
const missing = await runWorker(Buffer.from(html), 'fixture.html');
assert.equal(missing.code, 'IMPORT_DEPENDENCY_MISSING');
assert.match(missing.error, /componentes de importación/);
assert(!missing.error.includes(runtime), 'Internal deployment paths must not reach the administrator');

const files = JSON.parse(await readFile(resolve('.runtime/import-worker.files.json'), 'utf8'));
for (const expected of ['node_modules/acorn/dist/acorn.js', 'node_modules/linkedom/cjs/index.js',
  'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', 'node_modules/tesseract.js/src/worker-script/node/index.js'])
  assert(files.includes(expected), 'Worker deployment must include ' + expected);
assert(files.some(file => /tesseract.js-core\/.*\.wasm$/.test(file)), 'OCR WASM must be packaged');
const {default: config} = await import('../next.config.mjs');
assert(files.every(file => config.outputFileTracingIncludes['/api/admin/import'].includes('./' + file)));
let packageBytes = 0;
for (const file of files) {
  const source = resolve(root, file);
  assert(!relative(root, source).startsWith('..'), 'Only project runtime assets can be packaged');
  const info = await stat(source);
  if (!info.isFile()) continue;
  packageBytes += info.size;
  const destination = join(runtime, file);
  await mkdir(dirname(destination), {recursive: true});
  await copyFile(source, destination);
}

for (const level of ['bachillerato', 'universidad']) {
  const result = await runWorker(Buffer.from(html), 'fixture.html', level);
  assert(!result.error, result.error);
  assert.equal(result.result.tests[0].questions[0].options.length, 2);
  assert(result.result.tests.every(test => test.educationLevel === level));
}

const zip = new JSZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + ['Intereses académicos', '1. ¿Te gusta investigar?', 'a) Sí', 'b) No'].map(text => '<w:p><w:r><w:t>' + text + '</w:t></w:r></w:p>').join('') + '</w:body></w:document>');
const docx = await runWorker(await zip.generateAsync({type: 'nodebuffer'}), 'fixture.docx', 'universidad');
assert(!docx.error, docx.error);
assert.match(docx.result.text, /investigar/);
assert(docx.result.tests[0].questions.length);

const pdf = new jsPDF();
pdf.text(['Academic interests', '1. Do you like research?', 'a) Yes', 'b) No'], 20, 20);
const extractedPdf = await runWorker(Buffer.from(pdf.output('arraybuffer')), 'fixture.pdf');
assert(!extractedPdf.error, extractedPdf.error);
assert.match(extractedPdf.result.text, /Do you like research/);
assert(extractedPdf.result.tests[0].questions.length);

// A managed deployment can omit an optional platform binding while retaining
// canvas itself. Its loader wraps the dependency error in a cause chain.
// Hide only the copied binaries in the temporary package, then restore them.
const nativeBindings = files.filter(file => /^node_modules\/@napi-rs\/canvas(?:-[^/]+)?\/.*\.node$/.test(file));
assert(nativeBindings.length, 'The isolated PDF runtime must contain its native canvas binding');
const hiddenBindings = [];
try {
  for (const file of nativeBindings) {
    const path = join(runtime, file);
    await rename(path, path + '.unavailable');
    hiddenBindings.push(path);
  }
  const missingNative = await runWorker(Buffer.from(pdf.output('arraybuffer')), 'fixture.pdf');
  assert.equal(missingNative.code, 'IMPORT_DEPENDENCY_MISSING');
  assert.match(missingNative.error, /componentes de importación/);
  assert(!missingNative.error.includes(runtime), 'Native binding errors must not expose internal deployment paths');
  assert(!/native binding|node_modules|npm i/i.test(missingNative.error), 'Native loader instructions must not reach the administrator');
  const independentHtml = await runWorker(Buffer.from(html), 'fixture.html');
  assert(!independentHtml.error, independentHtml.error);
} finally {
  for (const path of hiddenBindings) await rename(path + '.unavailable', path);
}

const large = await runWorker(Buffer.from(html + '<p>' + 'Contexto de revisión. '.repeat(30_000) + '</p>'), 'large.html');
assert(!large.error, large.error);
assert(large.result.text.length > 600_000, 'The complete large result must arrive before IPC closes');
const invalid = await runWorker(Buffer.from('This is not a PDF'), 'invalid.pdf');
assert.match(invalid.error, /PDF válido/);

// Retry after a missing worker must clear the pending lock and use the same job.
await mkdir(resolve('.qa-tools'), {recursive: true});
const isolated = await mkdtemp(resolve('.qa-tools', 'import-runtime-'));
process.env.DB_DRIVER = 'sqlite';
process.env.DATABASE_PATH = join(isolated, 'runtime_test.sqlite');
process.env.IMPORT_PATH = join(isolated, 'imports');
await mkdir(process.env.IMPORT_PATH);
const outfile = join(isolated, 'server.cjs');
await build({stdin: {contents: "export {db,put,document} from './lib/server/store'; export {startJob} from './lib/server/import-jobs';", resolveDir: root, loader: 'ts'}, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile,
  plugins: [{name: 'server-only', setup(b) {b.onResolve({filter: /^server-only$/}, () => ({path: 'empty', namespace: 'empty'})); b.onLoad({filter: /.*/, namespace: 'empty'}, () => ({contents: ''}));}}]});
const {db, put, document, startJob} = createRequire(import.meta.url)(outfile);
const owner = 'institution:runtime-fixture', id = 'missing-worker-retry';
try {
  await db.migrate();
  await writeFile(join(process.env.IMPORT_PATH, id), html);
  await put(owner, 'rv360:imports', [{id, name: 'fixture.html', status: 'Pendiente', educationLevel: 'universidad'}]);
  process.chdir(isolated);
  await assert.rejects(startJob(owner, id), error => error.status === 503);
  assert.equal((await document(owner, 'rv360:imports'))[0].errorCode, 'IMPORT_WORKER_MISSING');
  process.chdir(root);
  await startJob(owner, id);
  let job;
  for (let i = 0; i < 120; i++) {
    job = (await document(owner, 'rv360:imports'))[0];
    assert.notEqual(job.status, 'Error', job.error);
    if (job.status === 'Completado') break;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  assert.equal(job.status, 'Completado');
  assert.equal(job.errorCode, undefined);
  assert.equal(job.educationLevel, 'universidad');
} finally {
  process.chdir(root);
  await db.close();
}
console.log(`PASS isolated import runtime: ${files.length} traced assets (${(packageBytes / 1e6).toFixed(1)} MB), HTML/DOCX/PDF without project dependencies, category preservation, large IPC result, controlled dependency/native binding errors and missing-worker recovery.`);
