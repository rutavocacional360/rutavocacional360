import nextEnv from "@next/env";
import { verifyDatabaseSchema } from './database-schema.mjs';
nextEnv.loadEnvConfig(process.cwd());
const { db } = await import("../lib/server/database.ts");
try {
  if (process.argv[2] === "migrate") {
    await db.migrate();
    console.log("Migraciones aplicadas correctamente (" + db.driver + ").");
  } else {
    await db.ensure();
    await db.prepare("SELECT 1").get();
    if (db.driver === 'mysql') {
      const result = await verifyDatabaseSchema(db);
      console.log('Esquema verificado: '+result.tables+' tablas y '+result.foreignKeys+' relaciones; comprobación sin modificar datos.');
    }
    console.log("Conexión disponible: " + db.driver);
  }
} catch (error) {
  console.error("Base de datos: " + (error.code || error.message));
  if (error.code === "DATABASE_CONFIG_INVALID") console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
