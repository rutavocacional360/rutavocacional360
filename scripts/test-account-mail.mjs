import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the real sender without contacting any mailbox or exposing credentials.
const result = await build({
  entryPoints: ['lib/server/mail.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'test-mail-transport', setup(build) {
    build.onResolve({ filter: /^(server-only|nodemailer)$/ }, args => ({ path: args.path, namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'server-only' ? '' : 'export default globalThis.__testMail;' }));
  } }],
});
const previous = { ...process.env };
const originalError = console.error, logs = [];
console.error = (...args) => logs.push(args.join(' '));
Object.assign(process.env, { APP_URL: 'https://ruta.example/', SMTP_HOST: 'smtp.hostinger.com', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'cuentas@ruta.example', SMTP_PASSWORD: 'synthetic-only', SMTP_FROM: 'cuentas@ruta.example' });
let closed = 0, mode = 'success', calls = 0;
globalThis.__testMail = { createTransport(options) {
  calls++;
  assert.equal(options.secure, true);
  return {
    async sendMail(message) {
      assert.equal(message.from, 'cuentas@ruta.example');
      assert.equal(message.to, 'student@example.test');
      if (mode === 'failure') throw Object.assign(Error('private SMTP details'), {code:'EAUTH',responseCode:535,command:'AUTH PLAIN',response:'private SMTP details'});
      if (mode === 'unsafe') throw {code:'secret-token',responseCode:'535 secret-token',command:'AUTH secret-token',response:'secret-token'};
      if (mode === 'timeout') throw {code:'ETIMEDOUT',command:'CONN'};
      return { accepted: mode === 'rejected' ? [] : [message.to] };
    },
    close() { closed++; },
  };
} };
try {
  const { sendAccountMail } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
  await sendAccountMail('student@example.test', 'Recovery', 'Test');
  for (mode of ['failure', 'rejected', 'unsafe', 'timeout']) {
    await assert.rejects(sendAccountMail('student@example.test', 'Recovery', 'Test'), error => error.status === 503 && !error.message.includes('private SMTP details'));
  }
  assert.equal(closed, 5);
  assert.match(logs[0], /code=EAUTH status=535 command=AUTH PLAIN/);
  assert.match(logs[1], /code=EENVELOPE/);
  assert.match(logs[2], /code=SMTP_ERROR/);
  assert.match(logs[3], /code=ETIMEDOUT command=CONN/);
  for (const secret of ['private SMTP details','secret-token','student@example.test','synthetic-only'])
    assert(!logs.join('\n').includes(secret));
  delete process.env.SMTP_PASSWORD;
  await assert.rejects(sendAccountMail('student@example.test', 'Recovery', 'Test'), error => error.status === 503);
  assert.equal(calls, 5);
  console.log('PASS account mail: accepted delivery, rejected recipient, sanitized SMTP errors, transport cleanup and missing configuration.');
} finally {
  console.error = originalError;
  for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
  Object.assign(process.env, previous);
  delete globalThis.__testMail;
}
