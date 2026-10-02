// Shared by the runtime and deployment checks, including direct `next start`.
export function mysqlConfig(env = process.env) {
  const errors = [];
  const present = value => typeof value === 'string' && !!value.trim() &&
    !/REEMPLAZAR|CHANGE.?ME|TU-DOMINIO|RUTA-PRIVADA-PERSISTENTE/i.test(value);
  let config;
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      config = {
        host: url.hostname.replace(/^\[|\]$/g, ''),
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: decodeURIComponent(url.pathname.slice(1)),
      };
      if (url.protocol !== 'mysql:' || url.search || url.hash ||
          ![config.host, config.user, config.password, config.database].every(present))
        throw Error();
    } catch {
      errors.push('Configura DATABASE_URL con una conexión MySQL completa, sin valores de ejemplo ni parámetros adicionales.');
    }
  } else {
    for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
      if (!present(env[key])) errors.push('Configura '+key+' con el valor real de MySQL; no uses valores de ejemplo.');
    }
    config = {host: env.DB_HOST?.trim(), port: Number(env.DB_PORT || 3306),
      user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME};
  }
  if (config && (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535))
    errors.push('El puerto MySQL debe estar entre 1 y 65535.');
  const connectionLimit = Number(env.DB_POOL_SIZE || 5);
  if (!Number.isInteger(connectionLimit) || connectionLimit < 1 || connectionLimit > 50)
    errors.push('DB_POOL_SIZE debe estar entre 1 y 50.');
  if (env.DB_SSL && !['true', 'false'].includes(env.DB_SSL))
    errors.push('DB_SSL debe ser true o false.');
  if (errors.length) throw Object.assign(new Error(errors.join('\n')), {
    code: 'DATABASE_CONFIG_INVALID', status: 503,
  });
  return {...config, connectionLimit};
}
