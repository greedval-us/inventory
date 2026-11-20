import { isDeepStrictEqual } from 'node:util';
import { CatalogError } from '../../shared/catalogError.js';
import { normalizeLabel } from '../../shared/catalogFields.js';
import { defineFields, label, optionalText, positiveId } from './schema.js';
import { previewStoredOptions } from './fieldConversion.js';
import { requireCollection } from './collections.js';
import { applyFieldChanges, createRecordTable, physicalName } from './tableStorage.js';

const selectTable = 'SELECT id, name, description, fields, collection_id FROM catalog_tables';

function readTable(row) {
  return { id: row.id, name: row.name, description: row.description, fields: JSON.parse(row.fields), collectionId: row.collection_id };
}

export function listTables(db, collectionId = null) {
  const rows = collectionId === null
    ? db.prepare(selectTable + ' ORDER BY id').all()
    : db.prepare(selectTable + ' WHERE collection_id = ? ORDER BY id').all(collectionId);
  return rows.map(readTable);
}

export function getTable(db, id) {
  const row = db.prepare(selectTable + ' WHERE id = ?').get(positiveId(id));
  if (!row) throw new CatalogError('Раздел не найден.');
  return readTable(row);
}

export function getTableField(table, key) {
  const field = table.fields.find(field => field.key === key);
  if (!field) throw new CatalogError('Столбец не найден в выбранном разделе.');
  return field;
}

export function getFileField(db, input) {
  const table = getTable(db, input?.tableId);
  const field = getTableField(table, input.fieldKey);
  if (field.type !== 'files') throw new CatalogError('Выберите поле для вложений.');
  if (input.recordId != null && !db.prepare('SELECT 1 FROM catalog_records WHERE table_id = ? AND id = ?')
    .get(table.id, positiveId(input.recordId))) throw new CatalogError('Запись не найдена в выбранном разделе.');
  return field;
}

export function previewFieldOptions(db, input) {
  const table = getTable(db, input?.tableId);
  const field = getTableField(table, input.fieldKey);
  return previewStoredOptions(db, physicalName(table.id), field);
}

function sectionNameKey(db, name, id = null) {
  const nameKey = normalizeLabel(name);
  if (db.prepare('SELECT 1 FROM catalog_tables WHERE name_key = ? AND id IS NOT ?').get(nameKey, id)) {
    throw new CatalogError(`Раздел «${name}» уже существует.`);
  }
  return nameKey;
}

export function insertTable(db, definition) {
  const name = label(definition?.name, 'название раздела');
  const description = optionalText(definition.description, 'текст описания раздела');
  const { fields, lastFieldId } = defineFields(definition.fields);
  const nameKey = sectionNameKey(db, name);
  const collectionId = definition.collectionId == null ? null : requireCollection(db, definition.collectionId);
  const { id } = db.prepare('UPDATE catalog_table_sequence SET last_id = last_id + 1 WHERE singleton = 1 RETURNING last_id AS id').get();
  db.prepare('INSERT INTO catalog_tables(id, name, name_key, description, fields, collection_id, last_field_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, nameKey, description, JSON.stringify(fields), collectionId, lastFieldId);
  createRecordTable(db, physicalName(id), fields);
  return { id, name, description, fields, collectionId };
}

export function copyTableStructure(db, input) {
  const source = getTable(db, input?.sourceId);
  return insertTable(db, {
    name: input.name,
    description: input.description === undefined ? source.description : input.description,
    fields: source.fields,
    collectionId: input.collectionId === undefined ? source.collectionId : input.collectionId,
  });
}

export function updateTable(db, input) {
  const table = getTable(db, input?.id);
  const name = input.name === undefined ? table.name : label(input.name, 'название раздела');
  const description = input.description === undefined ? table.description : optionalText(input.description, 'текст описания раздела');
  const nameKey = sectionNameKey(db, name, table.id);
  const collectionId = input.collectionId === undefined ? table.collectionId : input.collectionId;
  if (collectionId !== null) requireCollection(db, collectionId);
  if (input.fields !== undefined) {
    if (input.expectedFields !== undefined && !isDeepStrictEqual(input.expectedFields, table.fields)) {
      throw new CatalogError('Поля раздела уже изменились. Откройте настройки заново.');
    }
    const row = db.prepare('SELECT last_field_id FROM catalog_tables WHERE id = ?').get(table.id);
    const { fields, lastFieldId, changedOptions } = defineFields(input.fields, table.fields, row.last_field_id);
    applyFieldChanges(db, table, fields, changedOptions);
    db.prepare('UPDATE catalog_tables SET fields = ?, last_field_id = ? WHERE id = ?')
      .run(JSON.stringify(fields), lastFieldId, table.id);
    table.fields = fields;
  }
  db.prepare('UPDATE catalog_tables SET name = ?, name_key = ?, description = ?, collection_id = ? WHERE id = ?')
    .run(name, nameKey, description, collectionId, table.id);
  return { ...table, name, description, collectionId };
}

export function moveTable(db, input) {
  const table = getTable(db, input?.id);
  const collectionId = input.collectionId === null ? null : requireCollection(db, input.collectionId);
  db.prepare('UPDATE catalog_tables SET collection_id = ? WHERE id = ?').run(collectionId, table.id);
  return { ...table, collectionId };
}

export function deleteTable(db, input) {
  const { id } = getTable(db, input?.id);
  db.exec(`DROP TABLE ${physicalName(id)}`);
  db.prepare('DELETE FROM catalog_records WHERE table_id = ?').run(id);
  db.prepare('DELETE FROM catalog_tables WHERE id = ?').run(id);
  return { id };
}
