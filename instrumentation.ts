export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Managed hosts may launch Next directly without running package.json start.
    // Complete bootstrap before training or any request can query the database.
    const localTest = process.env.DB_DRIVER === 'sqlite'
      && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/.test(process.env.APP_URL || '')
      && /[\\/]\w+_test\.sqlite$/.test(process.env.DATABASE_PATH || '');
    if (process.env.NODE_ENV === 'production' && !localTest) {
      const { prepareHostinger } = await import('./lib/server/prepare-hostinger.mjs');
      await prepareHostinger();
    }
    const { expireTraining } = await import('./lib/server/training');
    await expireTraining();
  }
}
