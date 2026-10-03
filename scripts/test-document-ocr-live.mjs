// Optional live check: downloads public Spanish/English OCR models into an
// ignored temporary workspace. It is deliberately excluded from npm test.
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdir, mkdtemp, symlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {build} from 'esbuild';
import {createCanvas} from '@napi-rs/canvas';
import {jsPDF} from 'jspdf';

await mkdir(resolve('.qa-tools'), {recursive: true});
const folder = await mkdtemp(resolve('.qa-tools', 'ocr-live-'));
await symlink(resolve('node_modules'), join(folder, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const outfile = join(folder, 'import-worker.cjs');
await build({entryPoints: ['scripts/import-worker.mjs'], outfile, bundle: true,
  platform: 'node', target: 'node24', format: 'cjs', packages: 'external'});
const canvas = createCanvas(1200, 420), context = canvas.getContext('2d');
context.fillStyle = '#fff'; context.fillRect(0, 0, 1200, 420);
context.fillStyle = '#000'; context.font = '42px Arial';
['Mathematics practice', '1. What is 2 plus 2?', 'a) Four', 'b) Five'].forEach((line, index) => context.fillText(line, 50, 80 + index * 85));
const pdf = new jsPDF({orientation: 'landscape', unit: 'px', format: [1200, 420]});
pdf.addImage(canvas.toBuffer('image/png'), 'PNG', 0, 0, 1200, 420);
const result = await new Promise((resolveResult, reject) => {
  const child = fork(outfile, [], {cwd: folder, execArgv: ['--max-old-space-size=512'],
    env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP},
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true});
  let terminal, diagnostic = '';
  const timer = setTimeout(() => {child.kill(); reject(new Error('Live OCR exceeded 90 seconds'));}, 90_000);
  child.stderr.on('data', data => {diagnostic = (diagnostic + data).slice(-1000);});
  child.on('message', message => {if (message.result || message.error) terminal = message;});
  child.once('error', error => {clearTimeout(timer); reject(error);});
  child.once('exit', () => {
    clearTimeout(timer);
    if (terminal) resolveResult(terminal);
    else reject(new Error('OCR worker exited without a result: ' + diagnostic));
  });
  child.send({data: Buffer.from(pdf.output('arraybuffer')).toString('base64'), name: 'scanned-math.pdf', educationLevel: 'universidad'}, error => {
    if (error) {clearTimeout(timer); child.kill(); reject(error);}
  });
});
assert(!result.error, result.error);
assert.match(result.result.text, /What\s*is\s+2\s+plus\s+2/i);
assert(result.result.warnings.some(warning => /OCR/.test(warning)));
assert(result.result.tests[0].questions.length > 0);
assert(result.result.tests.every(test => test.educationLevel === 'universidad'));
console.log('PASS live OCR: image-only PDF recognized with real Spanish/English models, proposed questions, OCR review warning and university category. Models cached only under .qa-tools.');
