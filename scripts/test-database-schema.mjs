import assert from 'node:assert/strict';
import nextEnv from '@next/env';
import { verifyDatabaseSchema } from './database-schema.mjs';
import { assertTestDatabase } from './test-database-target.mjs';
nextEnv.loadEnvConfig(process.cwd());
const { createDatabase } = await import('../lib/server/database.ts');
assertTestDatabase();
const db = createDatabase({ ...process.env, DB_DRIVER: 'mysql' });
try {
  await db.migrate();
  const actual = await verifyDatabaseSchema(db);
  assert.equal(actual.tables, 21);
  assert(actual.foreignKeys > 0);
  // Simulate metadata drift without altering the real database, then verify that
  // missing safeguards are rejected instead of accepting a successful connection.
  for (const [kind, expectedError] of [
    ['table', /Falta la tabla users/],
    ['column', /Falta la columna users.email/],
    ['unique', /Falta UNIQUE en users/],
    ['foreign', /Falta la relación sessions/],
    ['checksum', /migración 001/],
    ['engine', /InnoDB y utf8mb4/],
  ]) {
    const filtered = { driver: 'mysql', prepare(sql) { return { async all() {
      let rows = await db.prepare(sql).all();
      if (kind === 'table' && sql.includes('information_schema.TABLES')) rows = rows.filter(row => row.name !== 'users');
      if (kind === 'column' && sql.includes('information_schema.COLUMNS')) rows = rows.filter(row => row.table_name !== 'users' || row.name !== 'email');
      if (kind === 'unique' && sql.includes('information_schema.STATISTICS')) rows = rows.filter(row => row.table_name !== 'users' || row.name === 'PRIMARY');
      if (kind === 'foreign' && sql.includes('information_schema.KEY_COLUMN_USAGE')) rows = rows.filter(row => row.table_name !== 'sessions');
      if (kind === 'checksum' && sql.includes('rv360_migrations')) rows = [];
      if (kind === 'engine' && sql.includes('information_schema.TABLES')) rows = rows.map(row => row.name === 'users' ? { ...row, engine: 'MyISAM' } : row);
      return rows;
    } }; } };
    await assert.rejects(verifyDatabaseSchema(filtered), expectedError);
  }
  console.log('PASS MySQL schema: 21 tablas, relaciones, índices y migración; rechaza seis tipos de esquema incompleto sin modificar datos.');
} finally { await db.close(); }
