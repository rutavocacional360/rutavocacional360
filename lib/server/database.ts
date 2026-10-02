import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
} from "mysql2/promise";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import columns from "../../database/columns.json" with { type: "json" };
import { mysqlConfig } from "./database-config.mjs";

type Scope = {
  connection?: PoolConnection;
  transaction?: boolean;
  unlock?: () => void;
};
const globalDB = globalThis as typeof globalThis & {
  rutaDatabase?: ReturnType<typeof createDatabase>;
};
export function createDatabase(env = process.env) {
  const driver = env.DB_DRIVER || "mysql";
  if (!["mysql", "sqlite"].includes(driver))
    throw Error("DB_DRIVER debe ser mysql o sqlite.");
  const scope = new AsyncLocalStorage<Scope>();
  let pool: Pool | undefined,
    sqlite: import("node:sqlite").DatabaseSync | undefined;
  let ready: Promise<void> | undefined;
  let sqliteQueue = Promise.resolve();
  const schema = (kind: string) =>
    readFileSync(resolve("database/" + kind + ".sql"), "utf8");
  const getPool = () => {
    if (pool) return pool;
    const config = mysqlConfig(env);
    pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      queueLimit: 100,
      connectTimeout: 10000,
      charset: "utf8mb4",
      timezone: "Z",
      multipleStatements: false,
      supportBigNumbers: true,
      bigNumberStrings: false,
      ...(env.DB_SSL === "true"
        ? {
            ssl: {
              rejectUnauthorized: true,
              ...(env.DB_SSL_CA
                ? { ca: readFileSync(env.DB_SSL_CA, "utf8") }
                : {}),
            },
          }
        : {}),
    });
    return pool;
  };
  async function initialize() {
    if (driver === "sqlite") {
      const { DatabaseSync } = await import("node:sqlite");
      const filename = resolve(
        /* turbopackIgnore: true */ env.DATABASE_PATH || "storage/ruta.sqlite",
      );
      mkdirSync(dirname(filename), { recursive: true });
      sqlite = new DatabaseSync(filename);
      sqlite.exec(schema("sqlite"));
      if (
        !(
          sqlite
            .prepare("PRAGMA table_info(assessment_attempts)")
            .all() as any[]
        ).some((c) => c.name === "answers")
      )
        sqlite.exec(
          "ALTER TABLE assessment_attempts ADD COLUMN answers TEXT NOT NULL DEFAULT '{}'",
        );
    } else {
      const [rows] = await getPool().query<any[]>(
        "SELECT version FROM rv360_migrations WHERE version='001'",
      );
      if (!rows.length)
        throw Error("Ejecuta npm run db:migrate para preparar la base MySQL.");
    }
  }
  async function ensure() {
    if (!ready)
      ready = initialize().catch((e) => {
        ready = undefined;
        throw e;
      });
    return ready;
  }
  async function migrate() {
    if (driver === "sqlite") return ensure();
    const conn = await getPool().getConnection();
    let locked = false;
    try {
      const [lock] = await conn.query<any[]>(
        "SELECT GET_LOCK(CONCAT(DATABASE(), ':rv360-migrate'), 30) AS acquired",
      );
      if (lock[0].acquired !== 1)
        throw Error("Otra migración está en ejecución.");
      locked = true;
      await conn.query(
        "CREATE TABLE IF NOT EXISTS rv360_migrations (version VARCHAR(32) PRIMARY KEY, checksum VARCHAR(64) NOT NULL, applied_at VARCHAR(32) NOT NULL) ENGINE=InnoDB",
      );
      const sql = schema("mysql"),
        checksum = createHash("sha256").update(sql).digest("hex");
      const [existing] = await conn.query<any[]>(
        "SELECT checksum FROM rv360_migrations WHERE version='001'",
      );
      if (existing.length) {
        if (existing[0].checksum !== checksum)
          throw Error(
            "La migración 001 cambió después de aplicarse. Crea una migración nueva.",
          );
        return;
      }
      for (const statement of sql
        .replace(/^--.*$/gm, "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await conn.query(statement);
      await conn.execute("INSERT INTO rv360_migrations VALUES ('001', ?, ?)", [
        checksum,
        new Date().toISOString(),
      ]);
      ready = undefined;
    } finally {
      if (locked)
        await conn
          .query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':rv360-migrate'))")
          .catch(() => {});
      conn.release();
    }
  }
  async function cleanup(context: Scope) {
    if (context.connection) {
      const conn = context.connection;
      context.connection = undefined;
      if (context.transaction) await conn.rollback().catch(() => {});
      await conn
        .query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':rv360-write'))")
        .catch(() => {});
      conn.release();
    }
    if (context.transaction && sqlite) sqlite.exec("ROLLBACK");
    context.transaction = false;
    context.unlock?.();
    context.unlock = undefined;
  }
  async function context<T>(fn: () => Promise<T>): Promise<T> {
    if (scope.getStore()) return fn();
    const state: Scope = {};
    return scope.run(state, async () => {
      try {
        return await fn();
      } finally {
        await cleanup(state);
      }
    });
  }
  async function exec(sql: string) {
    await ensure();
    const command = sql.trim().toUpperCase(),
      state = scope.getStore();
    if (command.startsWith("BEGIN")) {
      if (!state) throw Error("Las transacciones requieren db.context().");
      if (state.transaction)
        throw Error("No se permiten transacciones anidadas.");
      if (driver === "mysql") {
        const conn = await getPool().getConnection();
        state.connection = conn;
        const [lock] = await conn.query<any[]>(
          "SELECT GET_LOCK(CONCAT(DATABASE(), ':rv360-write'), 15) AS acquired",
        );
        if (lock[0].acquired !== 1) {
          conn.release();
          state.connection = undefined;
          throw Object.assign(
            Error("El servidor está ocupado. Vuelve a intentar."),
            { status: 503 },
          );
        }
        await conn.beginTransaction();
      } else {
        const previous = sqliteQueue;
        sqliteQueue = new Promise<void>((resolve) => {
          state.unlock = resolve;
        });
        await previous;
        sqlite!.exec("BEGIN IMMEDIATE");
      }
      state.transaction = true;
      return;
    }
    if (command === "COMMIT" || command === "ROLLBACK") {
      if (!state?.transaction) throw Error("No hay una transacción activa.");
      try {
        if (driver === "mysql")
          await state.connection![
            command === "COMMIT" ? "commit" : "rollback"
          ]();
        else sqlite!.exec(command);
        state.transaction = false;
      } finally {
        await cleanup(state);
      }
      return;
    }
    if (driver === "mysql")
      await (state?.connection || getPool()).query(translateSQL(sql));
    else sqlite!.exec(sql);
  }
  async function query(sql: string, args: any[], mode: "all" | "get" | "run") {
    await ensure();
    const state = scope.getStore();
    if (driver === "sqlite") {
      // Synchronous SQLite is retained only for local development. Never interleave a second request with an open transaction.
      if (!state?.transaction) await sqliteQueue;
      const statement = sqlite!.prepare(sql);
      return (statement[mode] as Function).apply(
        statement,
        args.map((v) => (v === undefined ? null : v)),
      );
    }
    const [result] = await (state?.connection || getPool()).execute(
      translateSQL(sql),
      args.map((v) => (v === undefined ? null : v)),
    );
    if (mode === "run") {
      const r = result as ResultSetHeader;
      return { changes: r.affectedRows, lastInsertRowid: r.insertId };
    }
    return mode === "get" ? (result as any[])[0] : result;
  }
  return {
    driver,
    ensure,
    migrate,
    context,
    exec,
    prepare: (sql: string) => ({
      get: (...args: any[]): Promise<any> => query(sql, args, "get"),
      all: (...args: any[]): Promise<any[]> => query(sql, args, "all"),
      run: (
        ...args: any[]
      ): Promise<{ changes: number; lastInsertRowid: number }> =>
        query(sql, args, "run"),
    }),
    transaction: <T>(fn: () => Promise<T>) =>
      context(async () => {
        await exec("BEGIN");
        try {
          const result = await fn();
          await exec("COMMIT");
          return result;
        } catch (e) {
          if (scope.getStore()?.transaction) await exec("ROLLBACK");
          throw e;
        }
      }),
    close: async () => {
      await pool?.end();
      sqlite?.close();
    },
  };
}
// A small, explicit dialect bridge keeps parameterized SQL shared with the local SQLite backend.
export function translateSQL(original: string) {
  let sql = original
    .replace(/\bIS \?/gi, "<=> ?")
    .replace(/ORDER BY rowid DESC/gi, "ORDER BY created_at DESC");
  const table = sql.match(
    /INSERT(?: OR (?:IGNORE|REPLACE))? INTO ([a-z_]+)\s*(?:VALUES|\()/i,
  )?.[1];
  const fields = table
    ? (columns as Record<string, string[]>)[table]
    : undefined;
  if (fields)
    sql = sql.replace(
      /(INSERT(?: OR (?:IGNORE|REPLACE))? INTO [a-z_]+)\s+VALUES/i,
      `$1 (${fields.map((k) => "`" + k + "`").join(",")}) VALUES`,
    );
  if (/INSERT OR REPLACE/i.test(sql)) {
    if (table !== "attempts") throw Error("Upsert no configurado.");
    sql =
      sql.replace(/INSERT OR REPLACE/i, "INSERT") +
      " ON DUPLICATE KEY UPDATE count=VALUES(count),`until`=VALUES(`until`)";
  }
  if (/INSERT OR IGNORE/i.test(sql)) {
    sql =
      sql.replace(/INSERT OR IGNORE/i, "INSERT") +
      " ON DUPLICATE KEY UPDATE submission_id=submission_id";
  }
  sql = sql
    .replace(/ON CONFLICT\([^)]+\) DO UPDATE SET/i, "ON DUPLICATE KEY UPDATE")
    .replace(/excluded\.([a-z_]+)/gi, "VALUES($1)");
  sql = sql.replace(
    /ON CONFLICT\(([^,)]+)[^)]*\) DO NOTHING/i,
    "ON DUPLICATE KEY UPDATE $1=$1",
  );
  sql = sql.replace(
    /json_extract\(([^,]+),('(?:[^']*)')\)/gi,
    "JSON_UNQUOTE(JSON_EXTRACT($1,$2))",
  );
  return sql
    .split(/('(?:''|[^'])*'|`[^`]*`)/g)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/\b(key|until)\b/gi, (word, _group, offset) =>
            /DUPLICATE\s*$/i.test(part.slice(0, offset))
              ? word
              : "`" + word + "`",
          ),
    )
    .join("");
}
export const db =
  globalDB.rutaDatabase || (globalDB.rutaDatabase = createDatabase());
