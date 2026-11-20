import { CatalogError } from '../../shared/catalogError.js';
import { requireCollection } from './collections.js';
import { orderedRows } from './recordPages.js';
import { positiveId } from './schema.js';
import { matchingRecords } from './searchFilter.js';
import { listTableSorts } from './tableSorts.js';
import { getTable } from './tables.js';

function selectedFields(table, keys) {
  if (!Array.isArray(keys) || !keys.length) {
    throw new CatalogError(`Выберите хотя бы один столбец раздела «${table.name}».`);
  }
  const available = new Map(table.fields.map(field => [field.key, field]));
  return Array.from(keys, key => {
    const field = available.get(key);
    if (!field) throw new CatalogError(`Столбец раздела «${table.name}» удалён или выбран повторно. Проверьте выбор.`);
    available.delete(key);
    return field;
  });
}

export function exportSheets(db, input) {
  if (!input || !Array.isArray(input.sections) || !input.sections.length) {
    throw new CatalogError('Выберите хотя бы один раздел для экспорта.');
  }
  const { tableId, collectionId, query, field } = input;
  if (tableId !== null) positiveId(tableId);
  if (collectionId !== null) requireCollection(db, collectionId);
  if (tableId !== null && collectionId !== null) throw new CatalogError('Выберите одну область для экспорта.');
  if (typeof query !== 'string' || typeof field !== 'string') throw new CatalogError('Укажите текст и поле для поиска.');

  const { sql, params } = matchingRecords({ tableId, collectionId, query, field });
  const matchingIds = `SELECT id FROM (${sql}) WHERE table_id = ?`;
  const filtered = Boolean(query.trim() || field.trim());
  const sorts = listTableSorts(db);
  const seen = new Set();
  const sheets = [];
  for (const selection of input.sections) {
    const table = getTable(db, selection?.tableId);
    if ((tableId !== null && table.id !== tableId) || (collectionId !== null && table.collectionId !== collectionId)) {
      throw new CatalogError('Один из разделов не входит в выбранную область экспорта.');
    }
    if (seen.has(table.id)) throw new CatalogError('Раздел выбран повторно.');
    seen.add(table.id);
    const fields = selectedFields(table, selection.fieldKeys);
    const rows = orderedRows(db, table, matchingIds, [...params, table.id], { fields, sort: sorts[table.id] });
    if (rows.length || !filtered) sheets.push({ name: table.name, fields, rows });
  }
  return sheets;
}
