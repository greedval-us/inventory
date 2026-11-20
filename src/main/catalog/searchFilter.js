import { CatalogError } from '../../shared/catalogError.js';
import { normalizeLabel } from '../../shared/catalogFields.js';
import { positiveId } from './schema.js';

export function matchingRecords(input) {
  const conditions = [];
  const params = [];
  if (input.tableId != null) {
    conditions.push('table_id = ?');
    params.push(positiveId(input.tableId));
  }
  if (input.collectionId != null) {
    conditions.push('table_id IN (SELECT id FROM catalog_tables WHERE collection_id = ?)');
    params.push(positiveId(input.collectionId));
  }
  const { field, query } = input;
  if ((field != null && typeof field !== 'string') || (query != null && typeof query !== 'string')) {
    throw new CatalogError('Укажите текст для поиска.');
  }
  const fieldKey = normalizeLabel(field ?? '');
  const needle = normalizeLabel(query ?? '');
  const terms = [];
  if (fieldKey) {
    terms.push('cell.key = ?');
    params.push(fieldKey);
  }
  if (needle) {
    terms.push('instr(cell.value, ?) > 0');
    params.push(needle);
  }
  if (terms.length) {
    const cellMatch = `EXISTS (SELECT 1 FROM json_each(search_values) AS cell WHERE ${terms.join(' AND ')})`;
    if (input.tableId == null && !fieldKey && needle) {
      conditions.push(`(${cellMatch} OR table_id IN (SELECT id FROM catalog_tables WHERE instr(name_key, ?) > 0))`);
      params.push(needle);
    } else {
      conditions.push(cellMatch);
    }
  }
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  return { sql: 'SELECT id, table_id FROM catalog_records' + where, params };
}
