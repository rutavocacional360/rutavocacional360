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

La etapa registrada controla una única ruta: EGB Superior y elección de bachillerato
muestran Bachillerato; estudiantes de BGU, graduados y quienes buscan su primera
carrera reciben Universidad. Tests, progreso, resultados, PDF y preparación siguen
esa ruta. Cada entrega nueva guarda su nivel; al cambiar de etapa se conserva el
historial y los resultados escolares no completan los tests universitarios.

El catálogo técnico usa las 34 figuras y 11 familias del Acuerdo
MINEDEC-MINEDEC-2025-00051-A, reforma del catálogo de 2024. Conserva identificadores
para las asignaciones existentes. La oferta complementaria de Artes se documenta
por separado, con sus requisitos propios.

Con todos los tests de la ruta completos y sus resultados publicados, el servidor
solicita a Gemini una interpretación de puntuaciones agregadas y candidatos
verificados. No envía nombres, correo ni respuestas abiertas. La IA explica
intereses y opciones; no certifica aptitud. `GEMINI_API_KEY` y `GEMINI_MODEL` son
variables privadas de Hostinger. La caché y el presupuesto diario se guardan en
MySQL. `AI_GUIDANCE_DAILY_REQUEST_LIMIT` limita solicitudes nuevas (por defecto 200).
Administración → Configuración muestra el último éxito o error real. Un fallo del
proveedor conserva las respuestas y la orientación local; los detalles técnicos
quedan en administración. Las pruebas con ejemplos ficticios se ejecutan
únicamente desde los scripts internos, fuera de la interfaz de producción.
`npm run test:ai:live` también comprueba ambas rutas y los asistentes administrativos
con la clave privada del entorno. Los rechazos del formato se distinguen de los
errores de credenciales; los errores temporales del proveedor se reintentan una vez.


Administración → Evaluaciones tiene pestañas independientes de Bachillerato y
Universidad. Crear, duplicar, importar y publicar conservan la categoría de la
pestaña; las versiones y los estados de los tests originales se gestionan por
ruta. Un documento puede importarse en cada categoría por separado. La
importación mantiene esa categoría al reintentar y al guardar los borradores.

En Evaluaciones y Simuladores, «Importar documento» admite PDF, Word `.docx`,
HTML `.html`/`.htm` (archivo o código pegado), TXT, Markdown `.md`, RTF y
OpenDocument `.odt`. El límite es 10 MB, 60 páginas por PDF y 500 preguntas por
instrumento. Los documentos Word antiguos `.doc` deben guardarse como `.docx`,
ODT o PDF; cambiarles solamente la extensión no los convierte.
La compatibilidad de Word sigue la documentación de [Mammoth](https://github.com/mwilliamson/mammoth.js);
ODT se lee según los párrafos, listas y tablas de [OpenDocument](https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part3-schema/OpenDocument-v1.3-os-part3-schema.html).

Selecciona primero Bachillerato o Universidad y comprueba el destino del diálogo.
Para documentos de texto, usa preguntas numeradas (`1. ...`), opciones (`a) ...`,
`b) ...`) y, cuando corresponda, `Clave: a`. Se reconocen también listas,
tablas de escalas, campos HTML y datos estáticos de preguntas. No se ejecutan
scripts del documento. La extracción crea contenido para revisar: completa
claves, imágenes, puntuación y opciones de estudio antes de publicar.
Los RTF y ODT importan texto; sus imágenes y fórmulas requieren revisión manual.
Los PDF escaneados usan OCR y necesitan acceso a los
[idiomas de Tesseract](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)
en su primera lectura; un PDF con texto seleccionable evita esa dependencia.
Si falla la extracción, «Reintentar extracción» conserva el archivo y la categoría.
Una versión de simulador conserva el nivel de su familia y solo puede vincularse
a cursos de ese nivel; para otro destino crea una copia independiente.

Los tests personalizados anteriores sin categoría única conservan sus resultados
en el historial. En Evaluaciones, abre «Tests anteriores sin categoría única» y
crea una copia para Bachillerato o Universidad antes de volver a asignarlos. Las
importaciones anteriores se clasifican desde su historial. Ningún resultado
anterior cambia de ruta al crear estas copias.

Tests y cursos muestran «Editar con IA» directamente en cada elemento. Los tests
publicados se editan en una nueva versión y los borradores conservan su contenido.
La introducción, las opciones de estudio y el autocompletado del simulador se
revisan en sus editores antes de publicar. No se ofrecen plantillas de creación.
Cursos conserva sus dos categorías al crear e importar
simuladores. Revisa preguntas, claves y asignaciones antes de publicar. Las notas
de práctica no determinan la modalidad recomendada: la orientación utiliza los
intereses entregados. Las relaciones con intereses y actividades son reglas
internas; no son baremos acreditados por el Ministerio.

Cursos y simuladores muestran una tarjeta por contenido, con sus versiones y
borradores dentro de ella. Editar una publicación abre su borrador existente;
publicar una nueva versión archiva la anterior. Los cursos permiten archivar,
restaurar, eliminar un borrador o eliminar todo el curso con confirmación. La
eliminación retira el catálogo y conserva los avances e informes ya registrados.
Los registros independientes con el mismo título se señalan para revisión; una
importación idéntica no crea otro curso. Los simuladores de un curso y sus
destinatarios deben corresponder a su nivel educativo.

La práctica independiente tiene sus propios intentos, separados de las actividades
de los cursos. El autoguardado envía las respuestas en orden y las entregas
recuperables permiten reintentar el cálculo sin perder respuestas. Si vence la
sesión administrativa, se solicita acceso conservando el editor abierto.

Los informes PDF individuales y de orientación siguen una sola ruta e incluyen
las respuestas, puntuaciones y orientación guardada con el estado real de la IA.
Las copias integrales anteriores siguen disponibles en el historial; los informes
nuevos se generan desde Mis resultados.

`npm run test:school` verifica catálogo, etapas, separación de resultados y las dos
plantillas. `npm run test:guidance:visual` prueba registro, publicación administrativa,
práctica del estudiante, notas y vistas de escritorio/móvil en una instalación aislada.

## Escuelas en administración

Administración → Escuelas permite crear centros con código único (AMIE o interno),
ciudad y contacto, editar sus datos, archivarlos y reactivarlos. Desde «Ver usuarios»
se asignan estudiantes y orientadores existentes; los filtros permiten encontrar
usuarios sin escuela o trasladarlos desde otro centro con confirmación.
También permite eliminar una escuela con confirmación: se retiran su ficha y sus
asignaciones, y se conservan las cuentas, los perfiles y los resultados.

Cada usuario tiene como máximo una escuela asignada. Archivar conserva asignaciones
y resultados, impide nuevas asignaciones y no suspende cuentas. El administrador
mantiene el control central: esta organización no concede permisos ni convierte a
un orientador en administrador de escuela, y no modifica el colegio declarado en
el perfil ni las evaluaciones anteriores.

El directorio y las asignaciones se guardan en MySQL, separados por institución y
fuera del contenido de sesión. Las consultas se paginan en el servidor; las ediciones
usan revisiones para detectar cambios simultáneos. Se utiliza la tabla documental
existente, sin modificar migraciones ya aplicadas. Las pruebas `test-schools.mjs`,
`test-schools-ui.mjs` y la integración HTTP verifican estos límites.

## Requisitos de compilación

Las herramientas necesarias para compilar (esbuild, Tailwind/PostCSS y TypeScript)
se incluyen en `dependencies`: Hostinger instala en modo producción y puede omitir
`devDependencies` antes de ejecutar `npm run build`. No cambies el comando de
compilación para ocultar un fallo ni desactives la comprobación de tipos.

La compilación de producción usa `next build --webpack`, las optimizaciones de
memoria de Webpack y un trabajador para generar páginas. Esta configuración
evita depender de Turbopack en el entorno de compilación de Hostinger. Conserva
la comprobación de TypeScript y la revisión de secretos en los archivos públicos.

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
si todavía no existe. La preparación se ejecuta desde `instrumentation.ts`, también
cuando el alojamiento inicia Next.js directamente sin pasar por `npm start`.
La preparación y la creación del administrador se incluyen en el código compilado;
el arranque no necesita ejecutar archivos de `scripts/`. Los esquemas SQL se incluyen
explícitamente en las trazas de despliegue de Next.js.
`build-workers.mjs` genera el ejecutable de importación y su manifiesto de
dependencias; las trazas de `/api/admin/import` incluyen ambos y los recursos
de Word, PDF y OCR. Desplegar solo el ejecutable sin sus dependencias interrumpe
la extracción. `node scripts/test-import-runtime.mjs` comprueba un paquete
aislado con HTML, DOCX y PDF, sin acceder al `node_modules` del proyecto.
Los cierres inesperados se registran como `import-worker-closed` con el código
de salida y la señal, sin incluir el texto del documento ni rutas internas.
El importador conserva el archivo para reintentar y distingue dependencias
faltantes de memoria insuficiente. `node scripts/test-import-worker-exit.mjs`
comprueba estos fallos y que un resultado completo no se pierda al cerrar el proceso.
La prueba opcional `node scripts/test-document-ocr-live.mjs` importa un PDF
compuesto solo por una imagen y descarga modelos públicos de español e inglés
en un directorio temporal de pruebas; no forma parte de `npm test`.
Usa las variables `ADMIN_*` e `INSTITUTION_*`. Retira `ADMIN_PASSWORD`
tras la primera instalación. Reiniciar nunca limpia ni reemplaza datos existentes.

Para desarrollo con tu MySQL configurado: `npm run dev`.
Para comprobar el primer inicio: `npm run db:check-initial` (un administrador y cero actividad).
Los catálogos de evaluación y orientación son contenido del sistema, no registros de alumnos ficticios.

## Comprobar el despliegue

Antes de publicar, ejecuta `npm test` (suites aisladas), `npm run build` y
`npm run test:integration`. La integración usa SQLite temporal por defecto;
con `GUIDANCE_DB_DRIVER=mysql` exige una base MySQL local terminada en `_test`.

`node scripts/test-guidance-server.mjs --crud-visual --users-visual` comprueba en
el navegador los formularios de usuarios y el ciclo completo de cursos de ambas
rutas: creación, actividades, guardado, recarga, publicación, versiones,
archivo, restauración y eliminación. Requiere la compilación y Playwright.

`npm run test:startup` comprueba el arranque real, el puerto y la conservación del
administrador al reiniciar por ambos caminos (`next start` y `npm start`); requiere una base MySQL local **nueva** terminada en
`_test`, con sus variables `DB_*`. No uses cuentas ni bases de producción.
El primer arranque y el reinicio directo se prueban desde un paquete temporal sin
`scripts/`, fuentes originales ni archivos `.env`, usando únicamente la compilación, los recursos trazados
y las dependencias instaladas.
El workflow `.github/workflows/verify.yml` prepara estas comprobaciones en Linux
con Node.js 24, instalación sin dependencias de desarrollo y MySQL 8.
`npm run test:users:visual` recorre el ciclo de cuentas, revocación de sesiones,
exportaciones, indicadores y doce pantallas de administración y estudiantes en
escritorio y móvil. Usa cuentas y almacenamiento temporales. Los recorridos
`test:guidance:visual` y `test:admin:visual` cubren resultados, PDF, prácticas e
importación, revisión y publicación de tests y simuladores en ambas rutas.

Si hPanel indica `Completed` pero el dominio responde HTTP 500, consulta
**Runtime logs**. Ese estado confirma la compilación, no la disponibilidad del
backend. El comando `verify:deployment` muestra el estado HTTP observado.
No vuelvas a desplegar los mismos valores de ejemplo: completa las variables
privadas de `.env.example` en hPanel y conserva los mensajes de error del arranque.

### Error `ENOTFOUND REEMPLAZAR_HOST_MYSQL`

Este error indica que quedó el nombre de ejemplo en las variables del servidor.
No se resuelve compilando otra vez con las mismas variables ni cambiando a SQLite.

1. En las variables privadas de la aplicación, configura `DB_DRIVER=mysql` y los
   valores reales de `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`
   proporcionados para tu base MySQL. No supongas que el host es el dominio web.
2. Revisa también `DATABASE_URL`: si existe, tiene prioridad sobre `DB_HOST` y las
   demás variables de conexión. Corrígela o retírala para utilizar las variables
   `DB_*`. Nunca incluyas la conexión ni contraseñas en archivos públicos.
3. Completa las demás variables de `.env.example` y ejecuta `npm run check:production`
   **en el entorno del alojamiento**. La comprobación no conecta a MySQL y no imprime
   credenciales. `npm run db:check` comprueba una instalación ya migrada.
4. Publica el código actualizado con Node.js 24, compilación `npm run build` e inicio
   `npm start`. Este inicio aplica las migraciones y prepara el administrador en la
   primera instalación. La instrumentación también prepara MySQL con un `next start` directo.
5. Comprueba `npm run verify:deployment -- https://rutavocacional360.com`. Solo una
   respuesta saludable de MySQL y el rechazo del acceso administrativo anónimo
   confirman las comprobaciones de disponibilidad; `Completed` por sí solo no basta.

La conexión ahora rechaza valores de ejemplo antes de crear el pool, incluso si se
inicia Next directamente. El arranque muestra qué configuración revisar ante fallos
de DNS, conexión, credenciales o permisos; no sustituye los datos reales del alojamiento.

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
Si `/recuperar` informa que no pudo enviar el correo, busca `[SMTP]` en **Runtime logs**
después del intento. El registro muestra únicamente códigos permitidos, el estado SMTP
y una indicación de qué revisar; no incluye destinatarios, contraseñas ni enlaces.
`EAUTH` indica autenticación rechazada; `EDNS`, `ECONNECTION` y `ETIMEDOUT` indican
problemas de resolución o conexión; `EENVELOPE` indica rechazo del remitente o destinatario.
`npm run check:smtp`, ejecutado con las variables del alojamiento, usa el mismo diagnóstico
y verifica conexión y autenticación sin enviar mensajes. En Hostinger Email, si el plan
lo permite, puede usarse una contraseña de aplicación en `SMTP_PASSWORD`:
[guía de Hostinger](https://www.hostinger.com/support/how-to-create-an-app-password-for-hostinger-email/).

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

Mis resultados muestra solo la ruta correspondiente a la etapa registrada: Ciencias/Técnico y figuras profesionales para Bachillerato, o carreras para Universidad. Administración
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
formularios, persistencia, cambio Técnico/Ciencias, numeración continua de opciones,
detalles de áreas, figuras y carreras, historial único, catálogo, PDF y consulta administrativa.
Comprueba también que Cursos excluya las modalidades generales sin perder los
simuladores heredados por sus áreas y figuras. Guarda capturas de escritorio,
tableta, móvil de 375/390 px y escala equivalente al 150 %, y `visual-results.json` en la carpeta
`.qa-tools/guidance-*` indicada al terminar. Mi orientación muestra las opciones
de la etapa actual; cada opción abre sus detalles y, en Universidad, las instituciones
que la ofrecen. Las explicaciones extensas, fuentes e historial se consultan bajo demanda.
El visor PDF tiene una pestaña propia y la política CSP permite leer los archivos
`blob:` generados localmente, sin habilitar conexiones a servidores externos.
