import nextEnv from '@next/env';
import {spawn} from 'node:child_process';
import {assertProductionConfig} from './production-config.mjs';

// Database preparation runs in instrumentation, including managed Next.js starts.
process.env.NODE_ENV ||= 'production';
nextEnv.loadEnvConfig(process.cwd());
try {
  assertProductionConfig();
  const server = spawn(process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-H', '0.0.0.0', ...process.argv.slice(2)],
    {env: process.env, stdio: 'inherit', windowsHide: true});
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => server.kill(signal));
  server.once('error', () => { console.error('No se pudo iniciar Next.js.'); process.exitCode = 1; });
  server.once('exit', code => { process.exitCode = code ?? 1; });
} catch (error) {
  console.error('Inicio cancelado: ' + error.message);
  process.exitCode = 1;
}
