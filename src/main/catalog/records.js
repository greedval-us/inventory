import { CatalogError } from '../../shared/catalogError.js';
import { cellValue, recordSearch } from './cellValues.js';
import { getTable } from './tables.js';
import { physicalName } from './tableStorage.js';
import { positiveId } from './schema.js';

export function readRecord(table, row) {
  const values = {};
  for (const field of table.fields) {
    const value = row[field.key];
    values[field.key] = field.type === 'checkbox' && value !== null ? Boolean(value) : value;
  }
  return { id: row.id, tableId: table.id, values };
}

function recordValues(fields, input, previous) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CatalogError('Укажите значения записи.');
  }
  const allowed = new Set(fields.map(field => field.key));
  if (Object.keys(input).some(key => !allowed.has(key))) {
    throw new CatalogError('Запись содержит неизвестный столбец.');
  }
  const values = {};
  const sql = [];
  for (const field of fields) {
    const raw = Object.hasOwn(input, field.key) ? input[field.key] : previous?.[field.key];
    const value = cellValue(field, raw);
    values[field.key] = value;
    sql.push(typeof value === 'boolean' ? Number(value) : value);
  }
  return { values, search: recordSearch(fields, values), sql };
}

export function saveRecord(db, request) {
  const table = getTable(db, request?.tableId);
  const physical = physicalName(table.id);
  const keys = table.fields.map(field => field.key);
  let previous;
  let id = request.id;
  if (id != null) {
    const row = db.prepare(`SELECT * FROM ${physical} WHERE id = ?`).get(positiveId(id));
    if (!row) throw new CatalogError('Запись не найдена в выбранном разделе.');
    previous = readRecord(table, row).values;
  }
  const data = recordValues(table.fields, request.values, previous);
  if (id == null) {
    const row = db.prepare('INSERT INTO catalog_records(table_id, search_values) VALUES (?, ?)').run(table.id, data.search);
    id = Number(row.lastInsertRowid);
    const placeholders = keys.map(() => '?').join(', ');
    db.prepare(`INSERT INTO ${physical}(id, ${keys.join(', ')}) VALUES (?, ${placeholders})`).run(id, ...data.sql);
  } else {
    const assignments = keys.map(key => `${key} = ?`).join(', ');
    db.prepare(`UPDATE ${physical} SET ${assignments} WHERE id = ?`).run(...data.sql, id);
    db.prepare('UPDATE catalog_records SET search_values = ? WHERE id = ?').run(data.search, id);
  }
  return { id, tableId: table.id, values: data.values };
}

export function deleteRecord(db, request) {
  const id = positiveId(request?.id);
  const tableId = positiveId(request.tableId);
  const result = db.prepare('DELETE FROM catalog_records WHERE id = ? AND table_id = ?').run(id, tableId);
  if (!result.changes) throw new CatalogError('Запись не найдена в выбранном разделе.');
  return { id, tableId };
}
