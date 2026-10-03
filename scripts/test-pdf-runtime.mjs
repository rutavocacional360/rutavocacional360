import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
import {createRuntimePackage} from './test-runtime-package.mjs';

// Run after npm run build. This package has no application source or private
// environment files; all data is synthetic and uses an isolated SQLite file.
const runtime = await createRuntimePackage();
await mkdir(resolve('.qa-tools'), {recursive:true});
const fixture = await mkdtemp(resolve('.qa-tools', 'pdf-runtime-'));
const {version} = JSON.parse(await readFile(resolve('node_modules/pdfjs-dist/package.json'), 'utf8'));
const expected = await readFile(resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'));
const workerPath = `/vendor/pdfjs-${version}.worker.js`;
const listener = createServer();
await new Promise((resolve,reject) => {
  listener.once('error',reject);
  listener.listen(0,'127.0.0.1',resolve);
});
const port = listener.address().port;
await new Promise((resolve,reject) => listener.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const env = {...process.env, NODE_ENV:'production', DB_DRIVER:'sqlite',
  DATABASE_PATH:join(fixture,'pdf_runtime_test.sqlite'), DATABASE_URL:'',
  APP_URL:origin, COOKIE_SECURE:'false', NEXT_DIST_DIR:'.next',
  IMPORT_PATH:join(fixture,'imports'), PROFILE_PHOTO_PATH:join(fixture,'photos'),
  ACADEMIC_CONTENT_PATH:join(fixture,'academic.json'),
  GEMINI_API_KEY:'', GUIDANCE_AI_ENABLED:'false', ADMIN_PASSWORD:'',
  SMTP_HOST:'', SMTP_PORT:'', SMTP_USER:'', SMTP_PASSWORD:'', SMTP_FROM:'', SMTP_SECURE:'',
  API_ORIGIN:'', VERCEL:'', NEXT_PUBLIC_DESIGN_PREVIEW:'', NEXT_TELEMETRY_DISABLED:'1'};

const databaseModule = join(fixture,'database.cjs');
await build({stdin:{contents:"export {createDatabase} from './lib/server/database';", resolveDir:process.cwd(), loader:'ts'}, outfile:databaseModule,
  bundle:true, platform:'node', format:'cjs', packages:'external', logLevel:'warning'});
const {createDatabase} = createRequire(import.meta.url)(databaseModule);
const database = createDatabase(env);
try {
  await database.migrate();
} finally {
  await database.close();
}

const child = spawn(process.execPath,
  ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],
  {cwd:runtime, env, stdio:'pipe', windowsHide:true});
let output = '', startupError;
const capture = chunk => { output = (output+chunk.toString()).slice(-12000); };
child.stdout.on('data',capture);
child.stderr.on('data',capture);
const stopped = new Promise(resolve => {
  child.once('error',error => { startupError=error; resolve(); });
  child.once('exit',resolve);
});
const diagnostic = () => Object.entries(env).reduce((log,[key,value]) =>
  /PASSWORD|SECRET|TOKEN|KEY/i.test(key) && value ? log.split(value).join('[redacted]') : log,output);

try {
  let response;
  const deadline = Date.now()+30000;
  while (Date.now()<deadline) {
    if (startupError) throw startupError;
    if (child.exitCode!==null || child.signalCode!==null)
      throw Error('Packaged Next.js server exited before serving the PDF worker\n'+diagnostic());
    try {
      response = await fetch(origin+workerPath,{signal:AbortSignal.timeout(1500)});
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve,150));
    }
  }
  assert(response,'Packaged Next.js server must start with the isolated SQLite fixture\n'+diagnostic());
  assert.equal(response.status,200,'The production runtime must contain the traced PDF worker');
  assert.match(response.headers.get('content-type')||'',/^(?:text|application)\/(?:javascript|ecmascript)\b/i,
    'The hosting response must use a MIME type accepted by module workers');
  const actual = Buffer.from(await response.arrayBuffer());
  assert(actual.equals(expected),'The deployed PDF worker must match the installed PDF.js package byte for byte');
  console.log('PASS PDF production runtime: traced asset, source-free Next.js package, isolated SQLite startup, HTTP 200, JavaScript MIME and matching worker bytes');
} finally {
  if (child.pid && child.exitCode===null && child.signalCode===null) {
    if (process.platform==='win32') {
      await new Promise(resolve => {
        const kill = spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore',windowsHide:true});
        kill.once('exit',resolve);
        kill.once('error',resolve);
      });
    } else child.kill('SIGTERM');
  }
  await stopped;
}
