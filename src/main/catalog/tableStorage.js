import { recordSearch } from './cellValues.js';
import { copyConvertedRows } from './fieldConversion.js';
import { positiveId } from './schema.js';
import { rowsForUpdate } from './storedRows.js';
import { CatalogError } from '../../shared/catalogError.js';
import { updateAttachmentFields } from './attachments.js';

const SQL_TYPES = { text: 'TEXT', date: 'TEXT', datetime: 'TEXT', month: 'TEXT', select: 'TEXT', number: 'REAL', checkbox: 'INTEGER' };

export function physicalName(id) {
  return `inventory_${positiveId(id)}`;
}

export function createRecordTable(db, name, fields) {
  const columns = ['id INTEGER PRIMARY KEY REFERENCES catalog_records(id) ON DELETE CASCADE'];
  for (const field of fields) {
    if (field.type !== 'files') columns.push(`${field.key} ${SQL_TYPES[field.type]}`);
  }
  db.exec(`CREATE TABLE ${name} (${columns.join(', ')}) STRICT`);
}

export function applyFieldChanges(db, table, fields, changedOptions) {
  const physical = physicalName(table.id);
  const existing = new Map(table.fields.map(field => [field.key, field]));
  const previousColumns = new Set(table.fields.filter(field => field.type !== 'files').map(field => field.key));
  const scalarFields = fields.filter(field => field.type !== 'files');
  const retained = scalarFields.filter(field => previousColumns.has(field.key));
  updateAttachmentFields(db, table, fields);
  for (const field of fields) {
    if (field.type === 'files' && previousColumns.has(field.key)
      && db.prepare(`SELECT 1 FROM ${physical} WHERE ${field.key} IS NOT NULL LIMIT 1`).get()) {
      throw new CatalogError(`Сначала очистите значения поля «${field.label}», чтобы изменить его тип на файлы.`);
    }
  }
  const converting = retained.some(field => existing.get(field.key).type !== field.type);
  if (converting || retained.length < previousColumns.size) {
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
    for (const field of scalarFields) {
      if (!previousColumns.has(field.key)) db.exec(`ALTER TABLE ${physical} ADD COLUMN ${field.key} ${SQL_TYPES[field.type]}`);
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
  for (const row of rowsForUpdate(db, physical, fields)) {
    update.run(recordSearch(fields, row), row.id);
  }
}
