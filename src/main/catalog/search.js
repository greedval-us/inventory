import { CatalogError } from '../../shared/catalogError.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, lastPageOffset } from '../../shared/registryPaging.js';
import { requireCollection } from './collections.js';
import { getTable, listTables } from './tables.js';
import { positiveId } from './schema.js';
import { matchingRecords } from './searchFilter.js';
import { newestPage, orderedRows, readPage, readTableRows } from './recordPages.js';
import { getTableSort, listTableSorts } from './tableSorts.js';

function validatePage(offset, limit) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new CatalogError('Некорректные параметры страницы.');
  }
}

export function searchRecords(db, input = {}) {
  const { offset = 0, limit = DEFAULT_PAGE_SIZE, tableId } = input;
  validatePage(offset, limit);
  const { sql, params } = matchingRecords(input);
  const { total } = db.prepare(`SELECT count(*) AS total FROM (${sql})`).get(...params);
  const sort = input.sort === undefined && tableId != null ? getTableSort(db, tableId) : input.sort;
  if (sort != null) {
    const table = getTable(db, tableId);
    const rows = orderedRows(db, table, `SELECT id FROM (${sql})`, params, { sort, limit, offset });
    return { rows, total };
  }
  const matches = newestPage(db, sql).all(...params, limit, offset);
  return { rows: readPage(db, matches), total };
}

export function searchRecordGroups(db, { collectionId, query, field, offsets = {}, sorts = listTableSorts(db), limit = DEFAULT_PAGE_SIZE } = {}) {
  validatePage(0, limit);
  if (!offsets || typeof offsets !== 'object' || Array.isArray(offsets)) {
    throw new CatalogError('Укажите страницы разделов.');
  }
  for (const [id, offset] of Object.entries(offsets)) {
    if (String(positiveId(Number(id))) !== id) throw new CatalogError('Некорректный идентификатор раздела.');
    validatePage(offset, limit);
  }
  if (!sorts || typeof sorts !== 'object' || Array.isArray(sorts)) {
    throw new CatalogError('Укажите сортировку по разделам.');
  }

  if (collectionId != null) requireCollection(db, collectionId);
  const { sql, params } = matchingRecords({ collectionId, query, field });
  const counts = db.prepare(`SELECT table_id, count(*) AS total FROM (${sql}) GROUP BY table_id`).all(...params);
  const totals = new Map(counts.map(row => [row.table_id, row.total]));
  const matchingIds = `SELECT id FROM (${sql}) WHERE table_id = ?`;
  const natural = newestPage(db, matchingIds);

  return listTables(db, collectionId).map(table => {
    const tableId = table.id;
    const total = totals.get(tableId) ?? 0;
    const offset = Math.min(offsets[tableId] ?? 0, lastPageOffset(total, limit));
    let rows = [];
    if (total && sorts[tableId] != null) {
      rows = orderedRows(db, table, matchingIds, [...params, tableId], { sort: sorts[tableId], limit, offset });
    } else if (total) {
      const ids = natural.all(...params, tableId, limit, offset).map(row => row.id);
      rows = readTableRows(db, table, ids);
    }
    return { tableId, rows, total, offset };
  });
}
