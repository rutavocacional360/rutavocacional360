# Instalar la base de datos de Ruta Vocacional

La aplicación completa requiere un alojamiento con Node.js 24 y MySQL 8.
Para Hostinger usa el repositorio `rutavocacional360/rutavocacional360`, rama
`main`: contiene esta aplicación completa con backend MySQL.
En el repositorio anterior `asopanasguasaganda-dev/ruta-vocacional`, la versión
completa está en `pruebas/hostinger-mysql-20261001`; su rama `main` es la vista
de pruebas de Vercel y no sustituye este backend.
El archivo `mysql.sql` contiene las 21 tablas de la aplicación, sin alumnos,
contraseñas ni cuentas de demostración. No es un respaldo de los datos locales.
Las etapas educativas y las preferencias se guardan en documentos del perfil;
las respuestas, informes y simuladores tienen sus propios registros e historial.

## Primera instalación

1. En hPanel crea una base MySQL vacía y un usuario con permisos sobre esa base.
   Usa los nombres completos y el host que muestre hPanel, incluidos los prefijos.
2. Configura las variables privadas de `database/hostinger.env.example` en el servidor.
   No publiques ese archivo con contraseñas reales. No uses `NEXT_PUBLIC_` para
   credenciales. Mantén las fotos e importaciones en almacenamiento privado persistente.
3. Instala dependencias con `npm ci --include=dev`. Con las variables configuradas ejecuta:

```sh
npm run db:migrate
npm run db:check
npm run check:production
npm run build
npm start
```

La migración crea tablas y registra su checksum en `rv360_migrations`.
Puede repetirse: no borra datos. `db:check` comprueba tablas, columnas obligatorias,
relaciones, índices únicos, InnoDB, utf8mb4 y la versión del esquema sin escribir datos.
El arranque ejecuta la misma verificación y rechaza una instalación incompleta
antes de abrir el servidor web.
El primer inicio crea el administrador mediante `ADMIN_*` e `INSTITUTION_*`;
retira `ADMIN_PASSWORD` después. El administrador no está incluido en el SQL.

Si importas `mysql.sql` con phpMyAdmin, igualmente debes ejecutar `db:migrate`
para registrar la migración antes de arrancar la aplicación. Para una instalación
existente, respalda primero y revisa `db:check`: `CREATE TABLE IF NOT EXISTS` no
repara automáticamente una tabla con columnas o restricciones diferentes.

## Trasladar datos existentes

- MySQL: detén las escrituras, exporta estructura y datos con phpMyAdmin (incluida
  `rv360_migrations`) y guarda la copia fuera de la carpeta pública. Importa en
  una base nueva, conecta la aplicación y ejecuta `db:check`. Comprueba usuarios,
  respuestas, historial de informes y simuladores antes de reabrir el servicio.
- SQLite antiguo: usa una copia consistente obtenida con su herramienta de respaldo,
  configura `SQLITE_SOURCE` y una base MySQL nueva previamente migrada.
  `npm run db:import-sqlite` revisa el traslado sin escribir. Solo después de
  revisar el resultado ejecuta `npm run db:import-sqlite -- --apply`.
  La importación es transaccional y rechaza destinos con datos. Las sesiones y
  enlaces de recuperación anteriores no se trasladan.
- La vista de pruebas con datos guardados en el navegador no constituye una base
  MySQL ni se incorpora automáticamente al servidor.

Respalda también los directorios privados de fotos, importaciones y catálogo:
la exportación SQL no contiene esos archivos. Prueba la restauración en una base
aislada antes de depender de un respaldo.

## Comprobación del servidor publicado

```sh
npm run db:check
npm run check:smtp
npm run verify:deployment -- https://tu-dominio
```

Verifica además registro, inicio de sesión, perfil, tests de Bachillerato y
Universidad, resultados, publicación administrativa y recuperación de contraseña.
`npm run test:mysql` escribe fixtures: úsalo exclusivamente en una base aislada
terminada en `_test`, nunca sobre la base de alumnos.
`npm run test:database-schema` comprueba además que el verificador rechace tablas,
columnas, índices, relaciones y migraciones incompletas; requiere la misma separación.
Configurar el esquema local no crea la base remota ni comprueba sus credenciales,
HTTPS, correo o permisos de archivos; eso se verifica en el alojamiento contratado.
