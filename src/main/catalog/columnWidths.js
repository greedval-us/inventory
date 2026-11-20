import { CatalogError } from '../../shared/catalogError.js';
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from '../../shared/columnWidths.js';
import { getTable, getTableField } from './tables.js';

export function listColumnWidths(db) {
  const widths = {};
  for (const { table_id, field_key, width } of db.prepare('SELECT table_id, field_key, width FROM catalog_column_widths').iterate()) {
    const columns = widths[table_id] ??= {};
    columns[field_key] = width;
  }
  return widths;
}

export function setColumnWidth(db, input) {
  const table = getTable(db, input?.tableId);
  const field = getTableField(table, input.fieldKey);
  const { width } = input;
  if (!Number.isInteger(width) || width < MIN_COLUMN_WIDTH || width > MAX_COLUMN_WIDTH) {
    throw new CatalogError(`Ширина столбца должна быть целым числом от ${MIN_COLUMN_WIDTH} до ${MAX_COLUMN_WIDTH} пикселей.`);
  }
  db.prepare(`INSERT INTO catalog_column_widths(table_id, field_key, width) VALUES (?, ?, ?)
    ON CONFLICT(table_id, field_key) DO UPDATE SET width = excluded.width`).run(table.id, field.key, width);
  return width;
}
