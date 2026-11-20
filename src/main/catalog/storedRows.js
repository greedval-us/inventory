import { CatalogError } from '../../shared/catalogError.js';

export function columnKey(field) {
  if (typeof field.key !== 'string' || !/^f_[1-9]\d*$/.test(field.key)) {
    throw new CatalogError('Некорректный ключ столбца в базе.');
  }
  return field.key;
}

export function* storedRows(db, name, fields, clause = 'ORDER BY id', params = []) {
  // node:sqlite can truncate TEXT at an embedded NUL. BLOB preserves the full UTF-8 byte length.
  const textKeys = [];
  const fileKeys = [];
  const columns = ['id'];
  for (const field of fields) {
    const key = columnKey(field);
    if (field.type === 'files') {
      // Keep each ordered attachment list in the same snapshot as its record.
      columns.push(`(SELECT json_group_array(json_object('id', id, 'name', name, 'size', size))
        FROM (SELECT id, name, size FROM catalog_attachments
          WHERE record_id = ${name}.id AND field_key = '${key}' ORDER BY position)) AS ${key}`);
      fileKeys.push(key);
    } else if (field.type === 'text' || field.type === 'select') {
      columns.push(`CAST(${key} AS BLOB) AS ${key}`);
      textKeys.push(key);
    } else {
      columns.push(key);
    }
  }
  const select = db.prepare(`SELECT ${columns.join(', ')} FROM ${name} ${clause}`);
  for (const row of select.iterate(...params)) {
    for (const key of fileKeys) row[key] = JSON.parse(row[key]);
    for (const key of textKeys) {
      if (row[key] !== null) row[key] = Buffer.from(row[key]).toString('utf8');
    }
    yield row;
  }
}

// Finish each read before writing. Both drivers allow the transaction to stay open between batches.
export function* rowsForUpdate(db, name, fields) {
  const limit = 256;
  let lastId = 0;
  while (true) {
    const batch = Array.from(storedRows(db, name, fields, 'WHERE id > ? ORDER BY id LIMIT ?', [lastId, limit]));
    yield* batch;
    if (batch.length < limit) return;
    lastId = batch[batch.length - 1].id;
  }
}
