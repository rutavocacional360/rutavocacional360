import nextEnv from "@next/env";
import { spawn } from "node:child_process";
import { assertProductionConfig } from "./production-config.mjs";
import { verifyDatabaseSchema } from './database-schema.mjs';
async function main() {
  process.env.NODE_ENV ||= 'production';
  nextEnv.loadEnvConfig(process.cwd());
  assertProductionConfig();
  if (process.env.DB_DRIVER !== "mysql")
    throw Error(
      "Hostinger requiere DB_DRIVER=mysql; se evita iniciar con almacenamiento local por error.",
    );
  const { db } = await import("../lib/server/database.ts");
  try {
    await db.migrate();
    await verifyDatabaseSchema(db);
    const admin = await db
      .prepare("SELECT id FROM users WHERE role='admin' LIMIT 1")
      .get();
    if (!admin) {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["scripts/create-admin.mjs"], {
          env: process.env,
          stdio: "inherit",
          windowsHide: true,
        });
        child.once("error", reject);
        child.once("exit", resolve);
      });
      if (result !== 0)
        throw Error(
          "Configura las variables ADMIN_* e INSTITUTION_* para la primera instalación.",
        );
    }
  } finally {
    await db.close();
  }

}

main().catch(error => {
  const messages = {
    ENOTFOUND: 'No se pudo resolver el host MySQL. Revisa DB_HOST o el host de DATABASE_URL en hPanel.',
    EAI_AGAIN: 'La resolución DNS de MySQL no está disponible. Revisa el host y la red del alojamiento.',
    ECONNREFUSED: 'MySQL rechazó la conexión. Revisa el host, el puerto y que el servicio esté disponible.',
    ETIMEDOUT: 'Se agotó el tiempo de conexión a MySQL. Revisa la red y los permisos de acceso del alojamiento.',
    ER_ACCESS_DENIED_ERROR: 'MySQL rechazó las credenciales. Revisa DB_USER y DB_PASSWORD o DATABASE_URL en hPanel.',
    ER_BAD_DB_ERROR: 'La base MySQL no existe. Créala en hPanel y revisa DB_NAME o DATABASE_URL.',
    ER_DBACCESS_DENIED_ERROR: 'El usuario MySQL no tiene acceso a la base configurada. Revisa sus permisos en hPanel.',
  };
  const message = messages[error.code] ||
    (error.code && error.code !== 'DATABASE_CONFIG_INVALID'
      ? 'No se pudo preparar la aplicación ('+error.code+'). Revisa la configuración y los permisos de MySQL.'
      : error.message);
  console.error('Inicio cancelado: '+message);
  process.exitCode = 1;
});
