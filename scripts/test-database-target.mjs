/** Resolve the same connection precedence as the application before any QA write. */
export function assertTestDatabase(env = process.env, { local = false } = {}) {
  const url = env.DATABASE_URL ? new URL(env.DATABASE_URL) : null;
  if (url && url.protocol !== 'mysql:') throw Error('DATABASE_URL debe usar mysql://.');
  const name = url ? decodeURIComponent(url.pathname.slice(1)) : env.DB_NAME;
  const host = url ? url.hostname : env.DB_HOST;
  if (!name?.endsWith('_test'))
    throw Error('Esta prueba requiere una base aislada terminada en _test.');
  if (local && !['localhost', '127.0.0.1', '[::1]', '::1'].includes(host))
    throw Error('Esta prueba requiere MySQL local y aislado.');
  return { name, host };
}
