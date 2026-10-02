# Ruta Vocacional 360° — proyecto para Hostinger

Repositorio de despliegue: [rutavocacional360/rutavocacional360](https://github.com/rutavocacional360/rutavocacional360),
rama `main`. En Hostinger selecciona Node.js 24, compilación `npm run build`
e inicio `npm start`, con las variables privadas del servidor configuradas.
El dominio elegido para la instalación es `rutavocacional360.com`;
configura `APP_URL=https://rutavocacional360.com` cuando esté conectado con HTTPS.

Este repositorio ejecuta una única aplicación Next.js con backend y MySQL. Las cuentas,
sesiones, respuestas, resultados, simuladores e indicadores se consultan en el servidor.
Se retiraron el modo de cuentas del navegador y la publicación estática de Vercel.
Trabaja y despliega desde esta misma carpeta; no se necesita generar otro proyecto ni un ZIP.

## Orientación de Bachillerato y Universidad

La orientación distingue dos rutas: EGB Superior hacia BGU (Bachillerato) y BGU hacia
educación superior (Universidad). El registro pide la etapa educativa sin obligar a
elegir modalidad. Los tests pueden dirigirse a una ruta o a ambas; sus resultados se
integran únicamente en la ruta configurada. Las respuestas anteriores se conservan.

En Administración → Evaluaciones, «Test de Bachillerato» prepara un cuestionario
interno de intereses editable. En Cursos → Bachillerato se pueden crear o importar
simuladores de Ciencias y Técnico. Revisa las preguntas,
claves y asignaciones antes de publicar. Las notas de práctica no determinan la
modalidad recomendada: la orientación usa los intereses entregados.

El catálogo técnico recoge las 34 figuras y 11 familias del Acuerdo
[MINEDUC-MINEDUC-2024-00065-A](https://educacion.gob.ec/wp-content/plugins/download-monitor/download.php?force=1&id=22029).
Su implementación es progresiva; no afirma que todos los colegios ofrezcan todas
las figuras. Las relaciones con intereses y las actividades de exploración son
reglas internas del sistema, no baremos acreditados por el Ministerio.

`npm run test:school` verifica catálogo, etapas, separación de resultados y las dos
plantillas. `npm run test:guidance:visual` prueba registro, publicación administrativa,
práctica del estudiante, notas y vistas de escritorio/móvil en una instalación aislada.

## Requisitos

Las herramientas necesarias para compilar (esbuild, Tailwind/PostCSS y TypeScript)
se incluyen en `dependencies`: Hostinger instala en modo producción y puede omitir
`devDependencies` antes de ejecutar `npm run build`. No cambies el comando de
compilación para ocultar un fallo ni desactives la comprobación de tipos.

- Node.js 24 y MySQL 8.
- Hostinger con soporte para aplicaciones Node.js/Next.js y MySQL.
- Una base vacía para el primer despliegue y un directorio privado persistente fuera del código.
- Clave Gemini del servidor. SMTP para recuperación de contraseñas por correo.

## Configuración y ejecución

Configura las variables de `.env.example` en hPanel. En local, usa un archivo privado
`.env.local`; no sobrescribas claves existentes. El ejemplo no contiene credenciales reales.

```sh
npm ci --include=dev
npm run check:production
npm run build
npm start
```

El arranque comprueba la configuración, aplica migraciones y crea el administrador solamente
si todavía no existe. Usa las variables `ADMIN_*` e `INSTITUTION_*`. Retira `ADMIN_PASSWORD`
tras la primera instalación. Reiniciar nunca limpia ni reemplaza datos existentes.

Para desarrollo con tu MySQL configurado: `npm run dev`.
Para comprobar el primer inicio: `npm run db:check-initial` (un administrador y cero actividad).
Los catálogos de evaluación y orientación son contenido del sistema, no registros de alumnos ficticios.

## Comprobar el despliegue

Consulta [la instalación y traslado de la base de datos](database/INSTALACION.md).
`db:check` verifica también tablas, columnas obligatorias, claves e índices de MySQL
sin modificar registros; no basta con que el servidor acepte una conexión.

```sh
npm run db:check
npm run verify:deployment -- https://tu-dominio
```

El verificador exige MySQL central y acceso administrativo protegido. Una web que muestra
«Alcance: este navegador» corresponde al despliegue antiguo, no al código de este proyecto.
El dominio anterior de Vercel no cambia automáticamente al modificar estos archivos.

Consulta [la auditoría de preparación](AUDITORIA-PRODUCCION.md).
Las contraseñas nuevas requieren de 15 a 128 caracteres. Define las credenciales del administrador
como variables privadas del servidor; no las incluyas en archivos públicos ni en el repositorio.
Los archivos privados `.env*`, `.local/`, `storage/` y `.qa-tools/` no se publican.
Las pruebas de base de datos solo deben ejecutarse sobre bases aisladas terminadas en `_test`.
SQLite se conserva únicamente como lector para migrar instalaciones anteriores y pruebas explícitas;
la aplicación usa MySQL por defecto y no recurre a almacenamiento de navegador si falla una conexión.

## Entrega del código fuente

La entrega debe excluir `node_modules`, `.next`, `.runtime`, `.qa-tools`, `references`, archivos
temporales y credenciales locales. La limpieza de algunas carpetas está pendiente por permisos
de Windows; consulta `AUDITORIA-PRODUCCION.md` antes de subir la carpeta completa.
Las dependencias y la compilación se generan durante la instalación. Conserva
`package-lock.json`: permite instalar las versiones verificadas con `npm ci --include=dev`.
No ejecutes `npm start` antes de instalar, configurar y compilar.

En Hostinger configura Node.js 24, las variables de `.env.example`, el comando de compilación
`npm run build` y el comando de inicio `npm start`. La base MySQL debe existir y el usuario
debe poder aplicar el esquema de `database/mysql.sql`. Usa rutas privadas persistentes para
importaciones, fotografías y catálogo, fuera del directorio reemplazado al desplegar.
No subas `.git` ni respaldos locales por el administrador de archivos.

La verificación local no sustituye la comprobación del dominio, HTTPS, permisos de almacenamiento,
correo y conexión MySQL en el alojamiento contratado. Ejecuta `npm run verify:deployment -- https://tu-dominio`
una vez publicado. Configura y prueba SMTP para habilitar la recuperación por correo.

## Recuperación de contraseñas en Hostinger

El mismo formulario `/recuperar` sirve para estudiantes y administradores. La aplicación
guarda hashes de las contraseñas en MySQL; el proveedor SMTP solo entrega el enlace.
El enlace vence en 30 minutos, se invalida al usarlo y cierra las sesiones anteriores.
Al terminar, el botón de ingreso dirige al acceso correspondiente al rol de la cuenta.

1. Crea un buzón de tu dominio en hPanel, por ejemplo `cuentas@tudominio.com`.
2. Configura `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`,
   `SMTP_USER` y `SMTP_FROM` con la dirección completa del buzón y `SMTP_PASSWORD`
   con su contraseña. Esta contraseña es distinta de las cuentas de la plataforma.
3. Configura `APP_URL=https://tudominio.com`, con el dominio definitivo y sin rutas.
   Para otro proveedor usa sus datos SMTP; con puerto 587 utiliza `SMTP_SECURE=false`
   para STARTTLS. La conexión siempre exige TLS y certificados válidos.
4. Completa MySQL y las demás variables de `.env.example`. Usa una aplicación Node.js
   con backend en Hostinger, Node.js 24, compilación `npm run build` e inicio `npm start`.
   Vuelve a desplegar después de cambiar variables.
5. Ejecuta `npm run check:production`, `npm run db:check` y `npm run check:smtp`
   en el entorno que tenga las variables de Hostinger. La última comprobación valida
   conexión y autenticación sin enviar mensajes; no garantiza entrega en bandeja de entrada.
6. Prueba `/recuperar` con una cuenta de estudiante y una de administrador que controles:
   recibe el correo, abre el enlace y cambia la contraseña; comprueba el acceso con la nueva,
   el rechazo de la anterior y que el enlace usado ya no funcione. Revisa spam y el estado
   de SPF/DKIM del dominio en hPanel si el mensaje no llega.

Las claves se configuran solo como variables privadas del servidor, sin `NEXT_PUBLIC_`.
La página antigua de Vercel no se actualiza con estos cambios locales. Publica este proyecto
y utiliza el nuevo dominio. Las cuentas del antiguo modo navegador no aparecen por sí solas
en MySQL: deben registrarse en la instalación central o migrarse desde una fuente disponible.
Un panel con cero estudiantes es correcto hasta que existan cuentas en su institución/grupo.

Referencias: [SMTP de Hostinger](https://www.hostinger.com/support/4305847-set-up-hostinger-email-on-your-applications-and-devices/)
y [despliegue Node.js en Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/).

## Ruta de bachillerato a universidad

El registro solicita cuenta, etapa educativa y colegio opcional. No pide elegir bachillerato,
especialidad, preferencia de aprendizaje ni carrera antes de recibir orientación. Mi perfil
permite guardar opcionalmente una modalidad ya cursada y su especialidad. No se confunde el bachillerato
que la persona ya cursó con la recomendación que obtiene. Las cuentas anteriores pueden
completar estos campos sin perder datos; no se modifica el esquema de MySQL.

Mis resultados muestra primero el perfil y la comparación Ciencias/Técnico; después,
áreas de Ciencias o figuras técnicas, actividades y conexiones universitarias. Administración
consulta la misma orientación y puede actualizarla desde la ficha del estudiante. Pantalla y
PDF utilizan el mismo informe guardado. Las versiones antiguas se conservan como historial.

Las sugerencias se calculan con instrumentos publicados y completos de seis dimensiones
RIASEC, normalizados con igual peso por instrumento. Una revisión de puntuaciones o un cambio
de perfil genera una nueva versión. Un intento pendiente no se sustituye por otro antiguo.
La modalidad declarada y la preferencia de aprendizaje no sustituyen las respuestas del test.
Una diferencia de al menos 4 puntos en la escala interna de 5–25 entre Investigación y
Realista, con interés de al menos 15, propone explorar Ciencias o Técnico respectivamente.
En otros casos se conservan ambas opciones. Es una regla interna de exploración, no un baremo
psicométrico ni un certificado de aptitud. Los intereses equilibrados o bajos no priorizan
especialidades; siempre se explican los siguientes pasos.

Las áreas de Ciencias no son títulos de especialidad. Las figuras técnicas son ejemplos
documentados, no el catálogo nacional completo ni una afirmación sobre la oferta de un colegio.
Las fuentes están enlazadas en el informe. Confirmar disponibilidad corresponde a cada institución.
El bachillerato elegido no elimina opciones universitarias; las conexiones son orientativas.

Verificación: `npm run test:guidance`. Tras compilar, se puede ejecutar
`node scripts/test-guidance-server.mjs --http` para comprobar acceso de estudiante y administrador,
perfil y reportes en una base SQLite temporal aislada, sin conectarse a MySQL de producción.
Esto no sustituye la prueba de despliegue contra el MySQL y dominio de Hostinger.

Prueba visual de integración: después de `npm run build`, ejecuta
`npm run test:guidance:visual`. Requiere Playwright (instalado localmente o en
`.qa-tools`) y Chrome en Windows; en otros sistemas usa Chromium de Playwright.
Abre un navegador aislado con cuentas sintéticas y una base temporal. Comprueba
formularios, persistencia, cambio Técnico/Ciencias, recomendaciones, detalle de
carrera, catálogo completo, renderizado y descarga del PDF y consulta administrativa.
Guarda capturas de escritorio, tableta y móvil y `visual-results.json` en la carpeta
`.qa-tools/guidance-*` indicada al terminar. La vista inicial resume cuatro carreras;
la pestaña de carreras conserva el listado completo y sus universidades desplegables.
El visor PDF tiene una pestaña propia y la política CSP permite leer los archivos
`blob:` generados localmente, sin habilitar conexiones a servidores externos.
