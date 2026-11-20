import { isDeepStrictEqual } from 'node:util';
import { CatalogError } from '../../shared/catalogError.js';
import { cellValue, recordSearch } from './cellValues.js';
import { getTable } from './tables.js';
import { physicalName } from './tableStorage.js';
import { positiveId } from './schema.js';
import { storedRows } from './storedRows.js';
import { attachmentValues, saveAttachmentValues } from './attachments.js';

export function readRecord(table, row) {
  const values = {};
  for (const field of table.fields) {
    const value = row[field.key];
    values[field.key] = field.type === 'checkbox' && value !== null ? Boolean(value) : value;
  }
  return { id: row.id, tableId: table.id, values };
}

function fieldKeys(table) {
  return new Set(table.fields.map(field => field.key));
}

function scalarKeys(table) {
  return table.fields.filter(field => field.type !== 'files').map(field => field.key);
}

function recordValues(db, table, input, { allowed, id = null, previous, resolveStaged }) {
  const { fields } = table;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CatalogError('Укажите значения записи.');
  }
  if (Object.keys(input).some(key => !allowed.has(key))) {
    throw new CatalogError('Запись содержит неизвестный столбец.');
  }
  const values = {};
  const sql = [];
  for (const field of fields) {
    const raw = Object.hasOwn(input, field.key) ? input[field.key] : previous?.[field.key];
    if (field.type === 'files') {
      const owner = { tableId: table.id, recordId: id, fieldKey: field.key };
      values[field.key] = attachmentValues(db, field, raw, previous?.[field.key], owner, resolveStaged);
      continue;
    }
    const value = cellValue(field, raw);
    values[field.key] = value;
    sql.push(typeof value === 'boolean' ? Number(value) : value);
  }
  return { values, search: recordSearch(fields, values), sql };
}

function saveFiles(db, table, id, values, previous) {
  for (const field of table.fields) {
    if (field.type === 'files' && (values[field.key].length || previous?.[field.key]?.length)) {
      saveAttachmentValues(db, id, field.key, previous?.[field.key] ?? [], values[field.key]);
    }
  }
}

function prepareRecordInsert(db, table, resolveStaged) {
  const columns = ['id', ...scalarKeys(table)];
  const physical = physicalName(table.id);
  const placeholders = columns.map(() => '?').join(', ');
  const insertIndex = db.prepare('INSERT INTO catalog_records(table_id, search_values) VALUES (?, ?)');
  const insertRow = db.prepare(`INSERT INTO ${physical}(${columns.join(', ')}) VALUES (${placeholders})`);
  const options = { allowed: fieldKeys(table), resolveStaged };
  return input => {
    const data = recordValues(db, table, input, options);
    const id = Number(insertIndex.run(table.id, data.search).lastInsertRowid);
    insertRow.run(id, ...data.sql);
    saveFiles(db, table, id, data.values);
    return { id, tableId: table.id, values: data.values };
  };
}

export function importRecords(db, request) {
  const table = getTable(db, request?.tableId);
  if (!isDeepStrictEqual(table.fields, request.fields)) {
    throw new CatalogError('Поля раздела изменились. Откройте предварительный просмотр заново.');
  }
  if (!Array.isArray(request.rows)) throw new CatalogError('Укажите строки для импорта.');
  const insert = prepareRecordInsert(db, table);
  for (const values of request.rows) insert(values);
  return { added: request.rows.length };
}

export function saveRecord(db, request, resolveStaged) {
  const table = getTable(db, request?.tableId);
  if (request.id == null) return prepareRecordInsert(db, table, resolveStaged)(request.values);

  const id = positiveId(request.id);
  const physical = physicalName(table.id);
  const [row] = storedRows(db, physical, table.fields, 'WHERE id = ?', [id]);
  if (!row) throw new CatalogError('Запись не найдена в выбранном разделе.');
  const previous = readRecord(table, row).values;
  const data = recordValues(db, table, request.values, { id, previous, resolveStaged, allowed: fieldKeys(table) });
  const keys = scalarKeys(table);
  if (keys.length) {
    const assignments = keys.map(key => `${key} = ?`).join(', ');
    db.prepare(`UPDATE ${physical} SET ${assignments} WHERE id = ?`).run(...data.sql, id);
  }
  db.prepare('UPDATE catalog_records SET search_values = ? WHERE id = ?').run(data.search, id);
  saveFiles(db, table, id, data.values, previous);
  return { id, tableId: table.id, values: data.values };
}

export function deleteRecord(db, request) {
  const id = positiveId(request?.id);
  const tableId = positiveId(request.tableId);
  const result = db.prepare('DELETE FROM catalog_records WHERE id = ? AND table_id = ?').run(id, tableId);
  if (!result.changes) throw new CatalogError('Запись не найдена в выбранном разделе.');
  return { id, tableId };
}
