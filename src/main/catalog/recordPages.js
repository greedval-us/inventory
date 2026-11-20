import { readRecord } from './records.js';
import { columnKey, storedRows } from './storedRows.js';
import { getTable } from './tables.js';
import { physicalName } from './tableStorage.js';
import { requireSortField } from './tableSorts.js';
import { formatCellValue } from '../../shared/catalogFields.js';

const NEWEST_FIRST = 'id DESC';

export function newestPage(db, query) {
  return db.prepare(query + ' ORDER BY ' + NEWEST_FIRST + ' LIMIT ? OFFSET ?');
}

function selectRows(db, table, clause, params) {
  const rows = storedRows(db, physicalName(table.id), table.fields, clause, params);
  return Array.from(rows, row => readRecord(table, row));
}

export function readTableRows(db, table, ids) {
  if (!ids.length) return [];
  const rows = selectRows(db, table, 'WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(ids)]);
  const byId = new Map(rows.map(row => [row.id, row]));
  return ids.map(id => byId.get(id));
}

const alphabet = new Intl.Collator('ru', { sensitivity: 'accent', numeric: true });

export function orderedRows(db, table, matches, params, { sort, fields = table.fields, limit = -1, offset = 0 }) {
  const field = sort == null ? null : requireSortField(table, sort);
  const sortKey = field && columnKey(field);
  const projection = { id: table.id, fields };
  const where = `WHERE id IN (${matches})`;
  if (field?.type === 'text' || field?.type === 'select' || field?.type === 'files') {
    // SQLite's NOCASE only folds ASCII. Sort the matching keys with Russian collation,
    // then fetch the requested columns in that order.
    const rows = storedRows(db, physicalName(table.id), [field], where, params);
    const keys = Array.from(rows, row => ({
      id: row.id,
      value: field.type === 'files' ? formatCellValue('files', row[sortKey]) || null : row[sortKey]?.trim() ?? null,
    }));
    const sign = sort.direction === 'asc' ? 1 : -1;
    keys.sort((a, b) => {
      if (a.value === null || b.value === null) return Number(a.value === null) - Number(b.value === null) || b.id - a.id;
      return sign * alphabet.compare(a.value, b.value) || b.id - a.id;
    });
    const visible = limit < 0 ? keys : keys.slice(offset, offset + limit);
    return readTableRows(db, projection, visible.map(row => row.id));
  }
  // Numbers and flags are stored natively, calendar fields in sortable ISO format.
  const order = field ? `${sortKey} ${sort.direction === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, ${NEWEST_FIRST}` : NEWEST_FIRST;
  return selectRows(db, projection, `${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
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
