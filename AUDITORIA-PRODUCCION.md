# Auditoría de preparación para producción

Fecha: 1 de octubre de 2026.

## Revisión del despliegue actual — 1 de octubre de 2026

El registro aportado por el usuario confirma `getaddrinfo ENOTFOUND
REEMPLAZAR_HOST_MYSQL` durante `instrumentation.register`: el alojamiento intenta
resolver un host de ejemplo. La comprobación actual de `/api/health` sigue devolviendo
HTTP 500. Las otras rutas también devolvieron HTTP 500 en la revisión anterior.
No se publicó esta revisión ni se modificaron credenciales o datos del alojamiento.
Falta sustituir allí la configuración MySQL real, comprobar `DATABASE_URL` (tiene
prioridad sobre `DB_*`) y desplegar con el inicio `npm start`.

Correcciones y comprobaciones de esta revisión del registro:

- Validación MySQL compartida entre la conexión y el comprobador de producción:
  detecta valores de ejemplo, campos ausentes, URLs incompletas, escapes inválidos,
  puertos, tamaño del pool y SSL antes de abrir conexiones, incluso con Next directo.
- Arranque con mensajes accionables de DNS, conexión y autenticación, sin volcar
  credenciales ni dejar un rechazo de promesa sin gestionar en el script de inicio.
- Se corrige la validación de nombres de bases `_test` codificados en `DATABASE_URL`;
  se valida el puerto de la conexión efectiva, respetando su prioridad.
- Compilación con Node.js 24.21.0 y TypeScript aprobada; 22/22 suites aisladas
  aprobadas. La nueva regresión prueba el error original antes de DNS y comprueba
  que el script de inicio termina con código 1 y diagnóstico legible.
- `npm audit --omit=dev`: cero vulnerabilidades conocidas. Verificación de secretos
  en recursos públicos aprobada.
- Prueba del visor PDF aprobada: contenido de canvas, paginación, zoom, recuperación
  de errores, URL blob y anchos de 320, 360, 390, 768 y 1280 píxeles.
- MySQL 8 en una instancia nueva y aislada: migraciones, 21 tablas, transacciones,
  registro concurrente y rollback, seguridad HTTP, estudiantes/administradores,
  perfiles persistidos, orientación y simuladores aprobados.
- Recorrido visual automatizado aprobado en escritorio/móvil, incluidos registro,
  formularios, informes, vista PDF, diálogo de carrera y administración. Evidencias
  locales privadas: `.qa-tools/guidance-wTP2sn/`; se inspeccionaron también capturas
  de resultados móviles y del visor PDF de escritorio.
- Inicio real mediante el script de Hostinger aprobado con otra base vacía:
  migración, creación del administrador, puerto por argumento y reinicio sin
  `ADMIN_PASSWORD`, conservando el usuario y su contraseña.

Verificado en la revisión local previa:

- Compilación completa con Node.js 24.14.0, Next.js 16.3.8 y TypeScript activo.
- `npm test`: 21/21 suites aprobadas. Se repararon la prueba de despliegue que
  aún esperaba Vercel/proxy y la resolución TypeScript de importación documental.
- MySQL 8 aislado: esquema de 21 tablas, migraciones repetibles, transacciones,
  rollback, Unicode, concurrencia, claves foráneas y consultas parametrizadas.
- Integración HTTP con MySQL: estudiantes y administrador, registro concurrente,
  rollback del registro, perfiles, informes, permisos, sesiones, recuperación de
  contraseña, protección CSRF, limitación de solicitudes y simuladores escolares.
- Verificación de secretos en recursos públicos aprobada; `npm audit --omit=dev`
  informó cero vulnerabilidades conocidas.
- Arranque real con MySQL aislado: migración, creación del administrador, puerto
  transmitido por línea de comandos y reinicio sin ADMIN_PASSWORD, conservando
  el identificador y la contraseña inicial del administrador.

Correcciones adicionales: el arranque transmite los argumentos de puerto a Next;
las pruebas validan la base efectiva de DATABASE_URL antes de escribir; el
verificador distingue HTTP 500/503 de una respuesta no JSON; la prueba HTTP
libera el proceso incluso cuando el servidor falla durante el arranque.
Se añadió un workflow de verificación en Linux; su ejecución remota está pendiente.

La revisión anterior encontró valores de ejemplo en el archivo privado preparado
para Hostinger. En el entorno local activo no hay una conexión de producción
configurada; los registros aportados confirman el host de ejemplo remoto. El envío real de correo,
la IA externa y la persistencia del almacenamiento remoto siguen sin verificarse.

## Resultado de la revisión anterior

El código compiló correctamente con Node.js 24.21.0 y Next.js 16.3.8, incluida la
comprobación de TypeScript. La instalación reproducible con `npm ci --include=dev`
informó cero vulnerabilidades conocidas en 461 paquetes auditados. Este resultado
corresponde a la fecha de revisión y no equivale a una prueba de penetración.

Comprobaciones aprobadas antes de retirar las dependencias y la compilación local:

- Límites reales de solicitudes, validación JSON, origen y protección CSRF.
- Configuración de producción, secretos, HTTPS, cookies y rutas privadas.
- Ausencia de los secretos configurados en recursos públicos y código del navegador.
- Analítica: fechas, grupos, versiones, periodos, datos vacíos y errores del proveedor IA.
- Motores de evaluación, ponderaciones, simuladores, intentos y reloj.
- MySQL: migraciones repetibles, transacciones y rollback, Unicode, concurrencia,
  claves foráneas y consultas parametrizadas.
- Seguridad HTTP: roles, contraseñas débiles, sesiones, rotación, recuperación de un
  solo uso, cuentas suspendidas, límites de acceso y cabeceras con nonce.
- Simuladores mediante HTTP y MySQL: recomendaciones, permisos por carrera,
  ocultación de respuestas correctas, inicio y entrega concurrentes, reanudación,
  notas, versiones, límites de intentos y conservación del historial.

Las pruebas de escritura se ejecutaron en una base nueva aislada terminada en
`_test`; esa base se eliminó al terminar. La base principal se consultó sin reiniciarla:
un administrador activo, cero estudiantes y cero entregas, informes e intentos.

## Limpieza y conservación

Se conserva el código fuente, `package-lock.json`, los esquemas de `database/`,
recursos públicos, scripts de instalación, pruebas reproducibles y avisos de terceros.
Las dependencias y los archivos compilados se regeneran en el servidor.

La limpieza física NO quedó completa. Se retiraron `.runtime`, `.design-preview`,
`.vercel`, `artifacts` y los scripts antiguos `scripts/qa-training`. Los archivos de
OCR descargados y `tsconfig.tsbuildinfo` se retiraron a un temporal recuperable.
El borrado permanente fue bloqueado por la revisión automática; la alternativa de
Papelera falló y Windows denegó mover `node_modules`. Permanecen `node_modules`,
`.next`, `.qa-tools` y `references`. Deben eliminarse con la cuenta propietaria de
Windows antes de cargar la carpeta completa. `.qa-tools` contiene material privado
de pruebas y nunca debe subirse. Estos directorios ya están excluidos de Git y Docker.

La configuración privada, credenciales locales y datos MySQL se resguardaron fuera
del proyecto. No deben cargarse en el alojamiento como parte del código. La base local
se detuvo de forma ordenada antes de resguardar su directorio; no se borraron sus tablas.
Para Hostinger configura una base y credenciales propias mediante variables privadas.

## Pendiente en el alojamiento

Todavía no se ha verificado esta entrega en un servidor Hostinger contratado.
Se deben comprobar allí MySQL, HTTPS, permisos y persistencia de archivos, dominio,
envío SMTP y disponibilidad del proveedor de IA. SMTP no estaba configurado durante
esta revisión; no se validó el envío real de recuperación por correo.

Esta revisión no incluye pruebas de carga ni certificación de accesibilidad. El
recorrido visual cubre las pantallas descritas arriba, no todas las combinaciones
posibles. La vista previa PDF se verificó en el recorrido de resultados y en su
prueba específica, sin reproducir el error registrado en la documentación anterior.

## Reproducción

1. Instalar Node.js 24 y ejecutar `npm ci --include=dev`.
2. Configurar las variables privadas a partir de `.env.example`.
3. Ejecutar `npm run check:production`, `npm run test:security` y `npm run build`.
4. Ejecutar `npm start`; el arranque aplica migraciones y crea el administrador solo
   cuando no existe. No vacía datos anteriores.
5. Comprobar `npm run db:check` y `npm run verify:deployment -- https://tu-dominio`.

Los scripts de integración que escriben datos requieren una base aislada de pruebas;
nunca deben ejecutarse sobre datos de usuarios reales.


## Corrección del arranque administrado — 1 de octubre de 2026

La preparación de MySQL ahora se ejecuta desde `instrumentation.ts` mediante
`scripts/prepare-hostinger.mjs`. Así también se aplican las migraciones, se verifica
el esquema y se crea el administrador inicial cuando el proveedor ejecuta Next.js
directamente. `npm start` conserva el puerto indicado y delega en ese mismo arranque.
La excepción SQLite queda limitada a pruebas con URL local y archivo `_test.sqlite`.

Validación local: 22 suites aprobadas; compilación Webpack, TypeScript y comprobación
de secretos aprobadas; MySQL 8 aislado con primer arranque directo, reinicio mediante
el wrapper y nuevo reinicio directo sin cambiar credenciales. Se verificaron 21 tablas,
migraciones repetibles, transacciones y los flujos HTTP de seguridad y simuladores.
No se utilizaron bases de usuarios reales ni se enviaron correos durante estas pruebas.

La consulta de solo lectura a `https://rutavocacional360.com/api/health` devolvió HTTP
500 durante esta revisión. Los registros aportados muestran un host MySQL de ejemplo.
Esta corrección local no sustituye los datos reales de conexión en hPanel y no se ha
publicado desde esta revisión. Pendiente: publicar los cambios, configurar MySQL real
y confirmar disponibilidad, almacenamiento persistente, SMTP e IA en Hostinger.

## Incidencia del paquete de ejecución — 2 de octubre de 2026

El despliegue de `fd6e2d9` compiló, pero Hostinger no incluyó
`scripts/prepare-hostinger.mjs` en su paquete de ejecución. La prueba anterior
arrancaba desde el repositorio completo y no detectó esta diferencia.

La instrumentación ahora importa la preparación como módulo del servidor compilado.
La creación del administrador también se importa, sin procesos secundarios ni rutas
a scripts originales. Los esquemas SQL, los catálogos, la imagen usada en informes
y el trabajador compilado de importación se incluyen explícitamente en las trazas.
La prueba de arranque construye un paquete temporal sin scripts, fuentes ni archivos
de entorno y verifica el primer inicio y un reinicio contra MySQL aislado.

Verificación de esta corrección: compilación y TypeScript aprobados con Node.js
24.21.0; 22 suites aprobadas; paquete reducido con primer arranque, inicio mediante
el wrapper y reinicio directo aprobados. MySQL aislado: 21 tablas, transacciones,
permisos, registro, acceso y simuladores HTTP aprobados. Los datos y la contraseña
del administrador se conservaron durante los reinicios. La disponibilidad en
Hostinger debe confirmarse tras desplegar este cambio.

## Revisión funcional y visual — 3 de octubre de 2026

Se ejecutaron las pruebas con Node.js 24.14.0, compilación de producción y datos
sintéticos aislados. Se corrigió un fallo reproducido en Chrome: al regresar de
Universidad a Bachillerato, la ficha administrativa elegía por fecha el informe
universitario. Ahora selecciona el informe de la etapa actual y conserva las otras
versiones en el historial. Si no existe un informe de la etapa actual, no muestra
otro nivel como vigente. La regresión está incluida en `npm test`.
La sección Informes y PDF conserva el acceso al historial aunque todavía no haya
un informe de la nueva etapa; al seleccionar otra versión, la vista PDF permanece abierta.

También se corrigieron las indicaciones del cuestionario que mencionaban pestañas
antiguas y se actualizaron las pruebas visuales a la navegación actual. Se añadieron
pruebas HTTP de inicio simultáneo de exámenes, conservación de respuestas, reloj
sin reinicio, vencimiento automático, límites de intentos y entrega sin duplicados.

Resultados:

- 37/37 suites aprobadas con Node.js 24.
- Compilación Webpack, TypeScript y revisión de secretos del cliente aprobadas.
- MySQL 8 aislado: migraciones, 21 tablas de aplicación, restricciones, rollback,
  concurrencia y pruebas HTTP de seguridad, importación, evaluaciones y simuladores.
- Paquete de ejecución sin fuentes, scripts ni archivos de entorno: primer inicio,
  reinicios y conservación de credenciales aprobados.
- Chrome: registro, perfil, cambio de etapa en ambas direcciones, informes escolar
  y universitario, ficha administrativa, descarga y visualización PDF, publicación
  de simulador y práctica completa con nota 100/100. Escritorio, tableta y móvil
  sin desbordamiento en los recorridos comprobados.
- Importaciones administrativas: HTML por texto y archivo, ambas categorías,
  tests y simuladores, recarga de borradores, historial del navegador, cálculo con
  el servidor, revisión y publicación. Sin IA configurada se conserva el contenido
  y puede completarse manualmente.
- Visor PDF: contenido, paginación, zoom, ajuste al ancho, error y reintento,
  enlaces blob y remontaje; sin errores de JavaScript.
- 17 pantallas públicas, de estudiante y de administración a 1440 px: HTTP correcto,
  contenido visible, sin errores de JavaScript ni desbordamientos horizontales.
- Cuestionario mediante interfaz: inicio explícito, respuesta, recarga con respuesta
  conservada, revisión, entrega, informe completo y preparación habilitada.
- `https://rutavocacional360.com`: comprobación de solo lectura aprobada, con MySQL
  saludable, institución inicial lista y API administrativa anónima rechazada (401).

La evidencia local está en `.qa-tools/system-*-current.log`,
`.qa-tools/system-tests-node24.log`, `.qa-tools/guidance-4ThZZM/visual-results.json`
y `.qa-tools/guidance-HXpVyH/admin-import-visual-results.json`. No publicar estos
archivos ni las credenciales de revisión. La documentación temporal también queda
excluida de Git y del contexto Docker.

Reproducción: `npm test`, `npm run build`, `npm run test:integration`,
`npm run test:guidance:visual`, `npm run test:admin:visual` y `npm run test:pdf`.
Las pruebas de MySQL y arranque requieren bases locales nuevas terminadas en `_test`;
las visuales requieren Playwright y Chrome, según las instrucciones del README.

La corrección permanece local: no se desplegó al alojamiento durante esta revisión.
La salud del dominio no acredita que ya incluya los cambios. Gemini real no pudo
probarse por ausencia de `GEMINI_API_KEY` local. SMTP tampoco está configurado
localmente; no se envió correo. Quedan por verificar esos servicios en Hostinger,
la persistencia de archivos después del despliegue y la restauración de respaldos.
No se declara una prueba de carga ni una auditoría completa de accesibilidad.
