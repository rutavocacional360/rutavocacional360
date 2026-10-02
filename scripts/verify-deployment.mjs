import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

/** Read-only deployment check; never logs in or creates application data. */
export async function verifyDeployment(input, request = fetch) {
  const url = new URL(input);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash)
    throw Error('Indica únicamente el origen del sitio, sin rutas ni credenciales.');
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname))
    throw Error('La dirección pública debe usar HTTPS.');
  const response = await request(url.origin+'/api/health', {cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(15000)});
  if (response.url && new URL(response.url).origin !== url.origin)
    throw Error('La comprobación fue redirigida a otro dominio. Verifica APP_URL y el dominio conectado.');
  if (!response.ok)
    throw Error(`El backend respondió HTTP ${response.status} en /api/health. Revisa Runtime logs de Hostinger: una compilación completada no confirma el arranque ni la conexión MySQL.`);
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw Error('La ruta /api/health no devuelve JSON. Comprueba el enrutamiento y que se publicó la aplicación Node.js completa.');
  const health = await response.json();
  if (!health.ok || health.mode !== 'server' || health.database !== 'mysql' || health.registrationReady !== true)
    throw Error('El servidor aún no está listo: debe usar MySQL y tener la institución inicial configurada.');
  const admin = await request(url.origin+'/api/admin/analytics', {cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(15000)});
  if ((admin.url && new URL(admin.url).origin !== url.origin) || admin.status !== 401)
    throw Error('No se confirmó la protección del panel administrativo para visitantes sin sesión.');
  return {ok:true,mode:'server',database:'mysql',registrationReady:true,adminProtected:true};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const origin = process.argv[2] || process.env.APP_URL;
    if (!origin) throw Error('Uso: npm run verify:deployment -- https://tu-dominio');
    console.log(JSON.stringify(await verifyDeployment(origin),null,2));
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
