import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from './test-database-target.mjs';
nextEnv.loadEnvConfig(process.cwd());
const { createDatabase } = await import("../lib/server/database.ts");
assertTestDatabase();
const db = createDatabase({ ...process.env, DB_DRIVER: "mysql" }),
  owner = "qa:" + randomUUID();
try {
  await db.migrate();
  await db.migrate();
  await assert.rejects(
    db.transaction(async () => {
      await db
        .prepare("INSERT INTO institutions VALUES(?,?,?)")
        .run(owner, "Prueba ñ 🚀", owner);
      await db
        .prepare("INSERT INTO documents(owner,key,value) VALUES(?,?,?)")
        .run(owner, "qa:rollback", "{}");
      throw Error("rollback-fixture");
    }),
    /rollback-fixture/,
  );
  assert.equal(
    await db.prepare("SELECT id FROM institutions WHERE id=?").get(owner),
    undefined,
  );
  assert.equal(
    await db.prepare("SELECT value FROM documents WHERE owner=?").get(owner),
    undefined,
  );
  await db
    .prepare(
      "INSERT INTO documents(owner,key,value) VALUES(?,?,?) ON CONFLICT(owner,key) DO UPDATE SET value=excluded.value,revision=revision+1",
    )
    .run(owner, "qa:count", JSON.stringify({ n: 0, text: "ñ 🚀" }));
  await Promise.all(
    [1, 2].map(() =>
      db.transaction(async () => {
        const row = await db
          .prepare("SELECT value FROM documents WHERE owner=? AND key=?")
          .get(owner, "qa:count");
        const value = JSON.parse(row.value);
        value.n++;
        await db
          .prepare("UPDATE documents SET value=? WHERE owner=? AND key=?")
          .run(JSON.stringify(value), owner, "qa:count");
      }),
    ),
  );
  assert.equal(
    JSON.parse(
      (await db.prepare("SELECT value FROM documents WHERE owner=?").get(owner))
        .value,
    ).n,
    2,
  );
  await assert.rejects(
    db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(owner, "missing-" + owner, Date.now() + 1000),
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM institutions WHERE id IS ?")
        .get(null)
    ).n,
    0,
  );
  console.log(
    "PASS MySQL: migración repetible, rollback, Unicode, concurrencia, claves foráneas y parámetros.",
  );
} finally {
  await db.prepare("DELETE FROM documents WHERE owner=?").run(owner);
  await db.close();
}
