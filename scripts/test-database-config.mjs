import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mysqlConfig } from '../lib/server/database-config.mjs';
import { createDatabase } from '../lib/server/database.ts';

const valid = {DB_HOST:'127.0.0.1', DB_USER:'qa', DB_PASSWORD:'synthetic-secret', DB_NAME:'qa_test'};
assert.equal(mysqlConfig(valid).connectionLimit, 5);
assert.equal(mysqlConfig({...valid, DB_PORT:'3319'}).port, 3319);
const url = 'mysql://qa:p%40ss%23word@[::1]:3319/qa_test';
assert.deepEqual(mysqlConfig({...valid, DATABASE_URL:url, DB_PORT:'invalid'}), {
  host:'::1', port:3319, user:'qa', password:'p@ss#word', database:'qa_test', connectionLimit:5,
});

// Invalid configuration must fail before creating a pool or resolving any hostname.
const original = mysql.createPool;
let poolCalls = 0;
mysql.createPool = () => { poolCalls++; throw Error('Unexpected connection attempt'); };
try {
  const invalid = [
    ...['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'].flatMap(key =>
      ['', '   ', 'REEMPLAZAR_HOST_MYSQL'].map(value => ({[key]:value}))),
    {DB_PORT:'0'}, {DB_PORT:'65536'}, {DB_PORT:'NaN'},
    {DB_POOL_SIZE:'0'}, {DB_POOL_SIZE:'1.5'}, {DB_POOL_SIZE:'51'}, {DB_SSL:'yes'},
    ...['not-a-url', 'postgres://qa:secret@localhost/db',
      'mysql://qa:secret@REEMPLAZAR_HOST_MYSQL/db',
      'mysql://qa:%52EEMPLAZAR@localhost/db', 'mysql://qa:%ZZ@localhost/db',
      'mysql://qa:secret@localhost/', 'mysql://qa@localhost/db',
      'mysql://qa:secret@localhost/db?multipleStatements=true',
      'mysql://qa:secret@localhost/db#fragment'].map(DATABASE_URL => ({DATABASE_URL})),
  ];
  for (const patch of invalid) {
    const db = createDatabase({...valid, ...patch, DB_DRIVER:'mysql'});
    try {
      for (const operation of [() => db.ensure(), () => db.migrate()]) {
        await assert.rejects(operation, error => {
          assert.equal(error.code, 'DATABASE_CONFIG_INVALID');
          assert.equal(error.status, 503);
          assert(!error.message.includes(valid.DB_PASSWORD));
          assert(!error.message.includes('mysql://'));
          return true;
        });
      }
    } finally { await db.close(); }
  }
  assert.equal(poolCalls, 0);
} finally { mysql.createPool = original; }

const privateDir = resolve(process.cwd(), '..', 'runtime-config-test');
const startup = spawnSync(process.execPath, ['scripts/start-hostinger.mjs'], {
  windowsHide:true, encoding:'utf8', timeout:15000,
  env:{...process.env, ...valid, DB_DRIVER:'mysql', DATABASE_URL:'',
    DB_HOST:'REEMPLAZAR_HOST_MYSQL', APP_URL:'https://ruta.example', COOKIE_SECURE:'true',
    GEMINI_API_KEY:'synthetic-only', IMPORT_PATH:privateDir+'/imports',
    PROFILE_PHOTO_PATH:privateDir+'/photos', ACADEMIC_CONTENT_PATH:privateDir+'/academic.json',
    SMTP_HOST:'', SMTP_USER:'', SMTP_PASSWORD:'', SMTP_FROM:'', SMTP_PORT:'', SMTP_SECURE:''},
});
assert.equal(startup.error, undefined);
assert.equal(startup.status, 1);
assert.match(startup.stderr, /Inicio cancelado:.*Configuración de producción incompleta/);
assert.match(startup.stderr, /Configura DB_HOST/);
assert(!startup.stderr.includes(valid.DB_PASSWORD));
assert(!/ENOTFOUND|unhandledRejection|Ready in/.test(startup.stdout+startup.stderr));
console.log('PASS MySQL configuration: placeholders, incomplete URLs, encoded values, ports, pool, SSL and direct runtime access rejected before DNS; credentials never logged.');
