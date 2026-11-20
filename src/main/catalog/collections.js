import { CatalogError } from '../../shared/catalogError.js';
import { normalizeLabel } from '../../shared/catalogFields.js';
import { label, positiveId } from './schema.js';

export function listCollections(db) {
  return db.prepare('SELECT id, name FROM catalog_collections ORDER BY id').all().map(({ id, name }) => ({ id, name }));
}

export function requireCollection(db, id) {
  if (!db.prepare('SELECT 1 FROM catalog_collections WHERE id = ?').get(positiveId(id))) {
    throw new CatalogError('Коллекция не найдена.');
  }
  return id;
}

export function saveCollection(db, input) {
  const name = label(input?.name, 'название коллекции');
  if (!Array.isArray(input.tableIds)) throw new CatalogError('Укажите разделы коллекции.');
  const tableIds = [...new Set(input.tableIds.map(positiveId))];
  let id = input.id == null ? null : requireCollection(db, input.id);
  const nameKey = normalizeLabel(name);
  if (db.prepare('SELECT 1 FROM catalog_collections WHERE name_key = ? AND id IS NOT ?').get(nameKey, id)) {
    throw new CatalogError(`Коллекция «${name}» уже существует.`);
  }
  if (id === null) {
    const row = db.prepare('INSERT INTO catalog_collections(name, name_key) VALUES (?, ?)').run(name, nameKey);
    id = Number(row.lastInsertRowid);
  } else {
    db.prepare('UPDATE catalog_collections SET name = ?, name_key = ? WHERE id = ?').run(name, nameKey, id);
  }
  db.prepare('UPDATE catalog_tables SET collection_id = NULL WHERE collection_id = ?').run(id);
  const assigned = db.prepare('UPDATE catalog_tables SET collection_id = ? WHERE id IN (SELECT value FROM json_each(?))')
    .run(id, JSON.stringify(tableIds));
  if (assigned.changes !== tableIds.length) throw new CatalogError('Один из выбранных разделов не найден.');
  return { id, name };
}

export function deleteCollection(db, input) {
  const id = positiveId(input?.id);
  const result = db.prepare('DELETE FROM catalog_collections WHERE id = ?').run(id);
  if (!result.changes) throw new CatalogError('Коллекция не найдена.');
  return { id };
}
