import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Only reads metadata; never repairs or removes tables in an existing installation.
export async function verifyDatabaseSchema(db) {
  if (db.driver !== 'mysql') throw Error('La comprobación del esquema requiere MySQL.');
  const sql = readFileSync(resolve('database/mysql.sql'), 'utf8');
  const expected = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS `([^`]+)` \(([\s\S]*?)\) ENGINE=/g)];
  const [tables, columns, indexes, references, migrations] = await Promise.all([
    db.prepare('SELECT TABLE_NAME name, ENGINE engine, TABLE_COLLATION collation FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()').all(),
    db.prepare('SELECT TABLE_NAME table_name, COLUMN_NAME name, IS_NULLABLE nullable, EXTRA extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()').all(),
    db.prepare('SELECT TABLE_NAME table_name, INDEX_NAME name, NON_UNIQUE non_unique, COLUMN_NAME column_name, SEQ_IN_INDEX position FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX').all(),
    db.prepare('SELECT TABLE_NAME table_name, COLUMN_NAME column_name, REFERENCED_TABLE_NAME target_table, REFERENCED_COLUMN_NAME target_column FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL').all(),
    db.prepare("SELECT checksum FROM rv360_migrations WHERE version='001'").all(),
  ]);
  const errors = [];
  if (migrations[0]?.checksum !== createHash('sha256').update(sql).digest('hex'))
    errors.push('La migración 001 no coincide con el esquema del proyecto. Ejecuta db:migrate; no edites una migración ya aplicada.');
  for (const [, name, definition] of expected) {
    const table = tables.find(row => row.name === name);
    if (!table) { errors.push('Falta la tabla '+name+'.'); continue; }
    if (table.engine !== 'InnoDB' || !table.collation?.startsWith('utf8mb4_'))
      errors.push(name+' requiere InnoDB y utf8mb4.');
    for (const [, field, declaration] of definition.matchAll(/^\s*`([^`]+)` ([^\n]+)/gm)) {
      const column = columns.find(row => row.table_name === name && row.name === field);
      if (!column) errors.push('Falta la columna '+name+'.'+field+'.');
      else {
        if (/NOT NULL/.test(declaration) && column.nullable !== 'NO') errors.push(name+'.'+field+' debe ser NOT NULL.');
        if (/GENERATED ALWAYS/.test(declaration) && !/GENERATED/i.test(column.extra)) errors.push(name+'.'+field+' debe ser una columna generada.');
      }
    }
    for (const [, kind, fields] of definition.matchAll(/(PRIMARY KEY|UNIQUE) \(([^)]+)\)/g)) {
      const wanted = [...fields.matchAll(/`([^`]+)`/g)].map(match => match[1]).join(',');
      const grouped = new Map();
      for (const row of indexes.filter(row => row.table_name === name && Number(row.non_unique) === 0)) {
        if (!grouped.has(row.name)) grouped.set(row.name, []);
        grouped.get(row.name).push(row.column_name);
      }
      if (![...grouped].some(([index, fields]) => fields.join(',') === wanted && (kind !== 'PRIMARY KEY' || index === 'PRIMARY')))
        errors.push('Falta '+kind+' en '+name+' ('+wanted+').');
    }
    for (const [, field, target, targetField] of definition.matchAll(/FOREIGN KEY \(`([^`]+)`\) REFERENCES `([^`]+)` \(`([^`]+)`\)/g)) {
      if (!references.some(row => row.table_name === name && row.column_name === field && row.target_table === target && row.target_column === targetField))
        errors.push('Falta la relación '+name+'.'+field+' → '+target+'.'+targetField+'.');
    }
  }
  if (errors.length) throw Error('Esquema MySQL incompleto:\n'+errors.join('\n'));
  return { tables: expected.length, foreignKeys: references.filter(row => expected.some(([, name]) => name === row.table_name)).length };
}
