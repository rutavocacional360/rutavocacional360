import { mailConfig } from "../lib/server/mail-config.mjs";
import { mysqlConfig } from "../lib/server/database-config.mjs";
import { isAbsolute, resolve, relative, dirname, basename, sep } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function canonical(value) {
  let parent = resolve(value), suffix = [];
  while (!existsSync(parent) && dirname(parent) !== parent) {
    suffix.unshift(basename(parent)); parent = dirname(parent);
  }
  return resolve(existsSync(parent) ? realpathSync(parent) : parent, ...suffix);
}
export function validateProductionConfig(env, root = process.cwd()) {
  const errors = [], warnings = [];
  for (const key of Object.keys(env)) {
    if (key.startsWith('NEXT_PUBLIC_') && /SECRET|PASSWORD|TOKEN|API_KEY|DATABASE|DB_URL|PRIVATE_KEY/i.test(key) && env[key])
      errors.push('Una variable secreta no puede usar el prefijo público: '+key+'.');
  }
  const present = key => !!env[key]?.trim() && !/REEMPLAZAR|CHANGE.?ME|TU-DOMINIO|RUTA-PRIVADA-PERSISTENTE/i.test(env[key]);
  const required = key => { if (!present(key)) errors.push('Configura '+key+'.'); };
  if (env.DB_DRIVER !== 'mysql') errors.push('DB_DRIVER debe ser mysql.');
  if (env.NEXT_PUBLIC_DESIGN_PREVIEW === 'true' || env.API_ORIGIN || env.VERCEL)
    errors.push('Hostinger debe ejecutar el backend central, sin modo de demostración, API_ORIGIN ni VERCEL.');
  let database;
  try { database = mysqlConfig(env); }
  catch (error) { errors.push(error.message); }
  required('APP_URL');
  try {
    const url = new URL(env.APP_URL), local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw Error();
    if (!local && (url.protocol !== 'https:' || env.COOKIE_SECURE !== 'true'))
      errors.push('El sitio público necesita HTTPS y COOKIE_SECURE=true.');
    if (!local && /_test$/.test(database?.database || ''))
      errors.push('La base de pruebas no debe utilizarse para el sitio público.');
  } catch { errors.push('APP_URL debe contener únicamente el origen del sitio.'); }
  required('GEMINI_API_KEY');
  const app = canonical(root);
  for (const key of ['IMPORT_PATH','PROFILE_PHOTO_PATH','ACADEMIC_CONTENT_PATH', ...(env.TRAINING_MEDIA_PATH ? ['TRAINING_MEDIA_PATH'] : [])]) {
    required(key);
    if (!env[key]) continue;
    if (!isAbsolute(env[key])) { errors.push(key+' debe ser una ruta absoluta.'); continue; }
    const destination = canonical(env[key]), rel = relative(app,destination);
    if (!rel || (!rel.startsWith('..'+sep) && rel !== '..' && !isAbsolute(rel)))
      errors.push(key+' debe estar fuera del directorio de la aplicación para conservar los archivos al desplegar.');
    if (destination.split(sep).some(part => ['public_html','public','hbuilds'].includes(part.toLowerCase())))
      errors.push(key+' debe apuntar a almacenamiento privado y persistente.');
  }
  const mail = ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'];
  if (mail.some(key=>env[key]) || env.SMTP_SECURE) errors.push(...mailConfig(env).errors);
  else warnings.push('SMTP pendiente: la recuperación de contraseñas por correo no está disponible.');
  return {errors, warnings};
}
export function assertProductionConfig(env = process.env, root = process.cwd()) {
  const result = validateProductionConfig(env, root);
  if (result.errors.length) throw Error('Configuración de producción incompleta:\n'+result.errors.join('\n'));
  for (const warning of result.warnings) console.warn(warning);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const {default: nextEnv} = await import('@next/env');
  nextEnv.loadEnvConfig(process.cwd());
  try { assertProductionConfig(); console.log('Configuración de producción verificada; no se imprimieron credenciales.'); }
  catch(error) { console.error(error.message); process.exitCode = 1; }
}
