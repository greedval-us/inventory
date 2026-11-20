import { readRecord } from './records.js';
import { getTable } from './tables.js';
import { physicalName } from './tableStorage.js';
import { requireSortField } from './tableSorts.js';

const NEWEST_FIRST = 'id DESC';

export function newestPage(db, query) {
  return db.prepare(query + ' ORDER BY ' + NEWEST_FIRST + ' LIMIT ? OFFSET ?');
}

export function readTableRows(db, table, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT * FROM ${physicalName(table.id)} WHERE id IN (${placeholders})`).all(...ids);
  const byId = new Map(rows.map(row => [row.id, readRecord(table, row)]));
  return ids.map(id => byId.get(id));
}

const alphabet = new Intl.Collator('ru', { sensitivity: 'accent', numeric: true });

export function sortedPage(db, table, sort, matches, params, limit, offset) {
  const field = requireSortField(table, sort);
  const direction = sort.direction === 'asc' ? 'ASC' : 'DESC';
  const source = `FROM ${physicalName(table.id)} WHERE id IN (${matches})`;
  if (field.type === 'text' || field.type === 'select') {
    // SQLite's NOCASE only folds ASCII. Sort the matching keys with Russian collation,
    // then fetch the complete records for just the requested page.
    const keys = db.prepare(`SELECT id, CAST(${field.key} AS BLOB) AS value ${source}`).all(...params);
    for (const row of keys) {
      if (row.value !== null) row.value = Buffer.from(row.value).toString('utf8').trim();
    }
    const sign = sort.direction === 'asc' ? 1 : -1;
    keys.sort((a, b) => {
      if (a.value === null || b.value === null) return Number(a.value === null) - Number(b.value === null) || b.id - a.id;
      return sign * alphabet.compare(a.value, b.value) || b.id - a.id;
    });
    return readTableRows(db, table, keys.slice(offset, offset + limit).map(row => row.id));
  }
  // Numbers and flags are stored natively, calendar fields in sortable ISO format.
  return db.prepare(`SELECT * ${source} ORDER BY ${field.key} ${direction} NULLS LAST, ${NEWEST_FIRST} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset).map(row => readRecord(table, row));
}

export function readPage(db, matches) {
  const groups = new Map();
  for (const row of matches) {
    if (!groups.has(row.table_id)) groups.set(row.table_id, []);
    groups.get(row.table_id).push(row.id);
  }
  const records = new Map();
  for (const [tableId, ids] of groups) {
    for (const record of readTableRows(db, getTable(db, tableId), ids)) records.set(record.id, record);
  }
  return matches.map(row => records.get(row.id));
}
