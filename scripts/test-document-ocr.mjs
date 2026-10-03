import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';
import {build} from 'esbuild';
import {jsPDF} from 'jspdf';

const require = createRequire(import.meta.url);
await mkdir(resolve('.qa-tools'), {recursive: true});
const folder = await mkdtemp(resolve('.qa-tools', 'ocr-failure-'));
const pdf = Buffer.from(new jsPDF().output('arraybuffer'));

for (const failingAction of ['loadLanguage', 'initialize']) {
  const fakeWorker = join(folder, failingAction + '-thread.cjs');
  // Exercise Tesseract's real promise/errorHandler implementation with a local
  // protocol worker. No OCR models, downloads or network access are needed.
  await writeFile(fakeWorker, `const {parentPort}=require('node:worker_threads');
    parentPort.on('message', ({workerId,jobId,action}) => parentPort.postMessage({
      workerId,jobId,action,status:action===${JSON.stringify(failingAction)}?'reject':'resolve',
      data:action===${JSON.stringify(failingAction)}?'Synthetic unavailable OCR model':{}
    }));`);
  const outfile = join(folder, failingAction + '-import.cjs');
  await build({entryPoints: ['scripts/import-worker.mjs'], outfile, bundle: true,
    platform: 'node', target: 'node24', format: 'cjs', packages: 'external',
    plugins: [{name: 'ocr-local-protocol', setup(b) {
      b.onResolve({filter: /^tesseract\.js$/}, () => ({path: 'ocr', namespace: 'ocr-fixture'}));
      b.onLoad({filter: /.*/, namespace: 'ocr-fixture'}, () => ({contents: `
        import real from 'tesseract-real';
        export const OEM=real.OEM;
        export const createWorker=(langs,oem,options)=>real.createWorker(langs,oem,{...options,workerPath:${JSON.stringify(fakeWorker)}});`, resolveDir: process.cwd()}));
      b.onResolve({filter: /^tesseract-real$/}, () => ({path: require.resolve('tesseract.js'), external: true}));
    }}]});
  const result = await new Promise((resolveResult, reject) => {
    const child = fork(outfile, [], {cwd: process.cwd(), execArgv: [],
      env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP},
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true});
    let terminal, diagnostic = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('OCR failure left the import process/thread alive: ' + failingAction));
    }, 8000);
    child.stderr.on('data', data => {diagnostic = (diagnostic + data).slice(-1000);});
    child.on('message', message => {if (message.result || message.error) terminal = message;});
    child.once('error', error => {clearTimeout(timer); reject(error);});
    child.once('exit', code => {
      clearTimeout(timer);
      if (!terminal) reject(new Error('OCR exited without a structured result: ' + diagnostic));
      else resolveResult({terminal, code});
    });
    child.send({data: pdf.toString('base64'), name: 'scanned.pdf', educationLevel: 'bachillerato'}, error => {
      if (error) {clearTimeout(timer); child.kill(); reject(error);}
    });
  });
  assert.equal(result.code, 0, 'The result must be delivered before a clean worker exit');
  assert.match(result.terminal.error, /idiomas OCR/);
  assert.match(result.terminal.error, /PDF con texto, Word o HTML/);
  assert(!result.terminal.result);
  assert(!result.terminal.error.includes('Synthetic'), 'Low-level model errors must not leak to the UI');
}
console.log('PASS OCR failures: real Tesseract loadLanguage/initialize rejections produce actionable errors and terminate the isolated import process and its live thread without network access.');
