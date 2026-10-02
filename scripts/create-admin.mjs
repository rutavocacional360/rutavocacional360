import nextEnv from "@next/env";
import {createAdmin} from "../lib/server/create-admin.mjs";
nextEnv.loadEnvConfig(process.cwd());
const {db} = await import("../lib/server/database.ts");
try {
  await createAdmin(db);
  console.log("Cuenta administrativa creada. Acceso: /admin/login");
} catch (error) {
  console.error(error.code || error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
