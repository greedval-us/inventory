import { recordSearch } from './cellValues.js';
import { copyConvertedRows, storedRows } from './fieldConversion.js';
import { positiveId } from './schema.js';

const SQL_TYPES = { text: 'TEXT', date: 'TEXT', datetime: 'TEXT', month: 'TEXT', select: 'TEXT', number: 'REAL', checkbox: 'INTEGER' };

export function physicalName(id) {
  return `inventory_${positiveId(id)}`;
}

export function createRecordTable(db, name, fields) {
  const columns = fields.map(field => `${field.key} ${SQL_TYPES[field.type]}`);
  db.exec(`CREATE TABLE ${name} (
    id INTEGER PRIMARY KEY REFERENCES catalog_records(id) ON DELETE CASCADE, ${columns.join(', ')}
  ) STRICT`);
}

export function applyFieldChanges(db, table, fields, changedOptions) {
  const physical = physicalName(table.id);
  const existing = new Map(table.fields.map(field => [field.key, field]));
  const retained = fields.filter(field => existing.has(field.key));
  const converting = retained.some(field => existing.get(field.key).type !== field.type);
  if (converting || retained.length < existing.size) {
    const replacement = physical + '_revised';
    createRecordTable(db, replacement, fields);
    if (converting) {
      copyConvertedRows(db, physical, replacement, existing, retained);
    } else {
      const columns = ['id', ...retained.map(field => field.key)].join(', ');
      db.exec(`INSERT INTO ${replacement}(${columns}) SELECT ${columns} FROM ${physical}`);
    }
    db.exec(`DROP TABLE ${physical}`);
    db.exec(`ALTER TABLE ${replacement} RENAME TO ${physical}`);
  } else {
    for (const field of fields) {
      if (!existing.has(field.key)) db.exec(`ALTER TABLE ${physical} ADD COLUMN ${field.key} ${SQL_TYPES[field.type]}`);
    }
  }

  // One update per field makes each replacement depend on the original value, including swapped labels.
  for (const [key, changes] of changedOptions) {
    db.prepare(`
      WITH changes(old_label, new_label) AS MATERIALIZED (SELECT key, value FROM json_each(?))
      UPDATE ${physical} SET ${key} = (SELECT new_label FROM changes WHERE old_label = ${physical}.${key})
      WHERE ${key} IN (SELECT old_label FROM changes)
    `).run(JSON.stringify(Object.fromEntries(changes)));
  }

  const sameSearchFields = fields.length === existing.size && fields.every(field => existing.get(field.key)?.label === field.label);
  if (!converting && !changedOptions.size && sameSearchFields) return;
  const update = db.prepare('UPDATE catalog_records SET search_values = ? WHERE id = ?');
  for (const row of storedRows(db, physical, fields)) {
    update.run(recordSearch(fields, row), row.id);
  }
}
