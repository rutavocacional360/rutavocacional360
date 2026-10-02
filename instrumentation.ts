export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Managed hosts may launch Next directly without running package.json start.
    // Complete bootstrap before training or any request can query the database.
    const localTest = process.env.DB_DRIVER === 'sqlite'
      && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/.test(process.env.APP_URL || '')
      && /[\\/]\w+_test\.sqlite$/.test(process.env.DATABASE_PATH || '');
    if (process.env.NODE_ENV === 'production' && !localTest) {
      const { spawn } = await import('node:child_process');
      const { resolve } = await import('node:path');
      await new Promise<void>((done, reject) => {
        const child = spawn(process.execPath, [resolve('scripts/prepare-hostinger.mjs')], {
          env: process.env, stdio: 'inherit', windowsHide: true,
        });
        child.once('error', () => reject(new Error('No se pudo ejecutar la preparación de MySQL.')));
        child.once('exit', code => code === 0 ? done() : reject(new Error(
          'Inicio cancelado: revisa los errores de configuración o MySQL anteriores en Runtime logs.',
        )));
      });
    }
    const { expireTraining } = await import('./lib/server/training');
    await expireTraining();
  }
}
