import { CatalogError } from '../../shared/catalogError.js';
import { getTable } from './tables.js';

export function requireSortField(table, sort) {
  const field = table.fields.find(field => field.key === sort?.key);
  if (!field || (sort.direction !== 'asc' && sort.direction !== 'desc')) {
    throw new CatalogError('Выберите существующий столбец и направление сортировки.');
  }
  return field;
}

export function listTableSorts(db) {
  const rows = db.prepare('SELECT table_id, field_key, direction FROM catalog_table_sorts').all();
  return Object.fromEntries(rows.map(row => [row.table_id, { key: row.field_key, direction: row.direction }]));
}

export function getTableSort(db, tableId) {
  return db.prepare('SELECT field_key AS key, direction FROM catalog_table_sorts WHERE table_id = ?').get(tableId);
}

export function setTableSort(db, input) {
  const table = getTable(db, input?.tableId);
  const sort = input.sort;
  if (sort === null) {
    db.prepare('DELETE FROM catalog_table_sorts WHERE table_id = ?').run(table.id);
    return null;
  }
  const field = requireSortField(table, sort);
  db.prepare(`INSERT INTO catalog_table_sorts(table_id, field_key, direction) VALUES (?, ?, ?)
    ON CONFLICT(table_id) DO UPDATE SET field_key = excluded.field_key, direction = excluded.direction`)
    .run(table.id, field.key, sort.direction);
  return { key: field.key, direction: sort.direction };
}
