import { CatalogError } from '../../shared/catalogError.js';
import { acceptsAttachment } from '../../shared/attachmentKinds.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function getAttachment(db, id, owner) {
  if (typeof id !== 'string' || !uuid.test(id)) throw new CatalogError('Некорректный идентификатор вложения.');
  const select = 'SELECT id, name, size FROM catalog_attachments WHERE id = ?';
  const file = owner
    ? db.prepare(select + ' AND record_id = ? AND field_key = ?').get(id, owner.recordId ?? null, owner.fieldKey)
    : db.prepare(select).get(id);
  if (!file) throw new CatalogError('Вложение не найдено.');
  return { ...file };
}

export function listAttachments(db) {
  return db.prepare('SELECT id, name, size FROM catalog_attachments').all().map(file => ({ ...file }));
}

// Only previous values from this cell or files staged by the main process can be attached.
// Descriptions from the renderer are never used as filenames or authoritative metadata.
export function attachmentValues(db, field, raw, previous, owner, resolveStaged) {
  const input = raw ?? [];
  if (!Array.isArray(input)) throw new CatalogError(`Укажите список файлов в поле «${field.label}».`);
  if (field.required && !input.length) throw new CatalogError(`Заполните обязательное поле «${field.label}».`);
  const retained = new Map(previous?.map(file => [file.id, file]));
  const seen = new Set();
  return Array.from(input, item => {
    const id = typeof item === 'string' ? item : item?.id;
    if (typeof id !== 'string' || !uuid.test(id) || seen.has(id)) {
      throw new CatalogError(`Неизвестное или повторяющееся вложение в поле «${field.label}».`);
    }
    seen.add(id);
    if (retained.has(id)) return retained.get(id);
    const staged = resolveStaged?.(id, owner);
    if (staged?.id !== id || typeof staged.name !== 'string' || !staged.name || /[\\/:\x00-\x1f]/u.test(staged.name)
      || staged.name === '.' || staged.name === '..' || !Number.isSafeInteger(staged.size) || staged.size < 0
      || db.prepare('SELECT 1 FROM catalog_attachments WHERE id = ? UNION ALL SELECT 1 FROM removed_attachments WHERE id = ?').get(id, id)) {
      throw new CatalogError(`Выберите файл заново для поля «${field.label}».`);
    }
    if (!acceptsAttachment(field.fileKind, staged.name)) {
      throw new CatalogError(`Файл «${staged.name}» не соответствует типу поля «${field.label}».`);
    }
    return { id, name: staged.name, size: staged.size };
  });
}

export function saveAttachmentValues(db, recordId, key, previous, files) {
  const positions = new Map(previous.map((file, index) => [file.id, index]));
  const keep = new Set(files.map(file => file.id));
  for (const id of positions.keys()) {
    if (!keep.has(id)) db.prepare('DELETE FROM catalog_attachments WHERE id = ?').run(id);
  }
  for (const [position, { id, name, size }] of files.entries()) {
    if (!positions.has(id)) {
      db.prepare('INSERT INTO catalog_attachments(id, record_id, field_key, position, name, size) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, recordId, key, position, name, size);
    } else if (position !== positions.get(id)) {
      db.prepare('UPDATE catalog_attachments SET position = ? WHERE id = ?').run(position, id);
    }
  }
}

export function updateAttachmentFields(db, table, fields) {
  const next = new Map(fields.map(field => [field.key, field]));
  const inTable = 'WHERE record_id IN (SELECT id FROM catalog_records WHERE table_id = ?) AND field_key = ?';
  for (const field of table.fields.filter(field => field.type === 'files')) {
    const target = next.get(field.key);
    if (!target) {
      db.prepare('DELETE FROM catalog_attachments ' + inTable).run(table.id, field.key);
    } else if (target.type !== 'files') {
      if (db.prepare('SELECT 1 FROM catalog_attachments ' + inTable + ' LIMIT 1').get(table.id, field.key)) {
        throw new CatalogError(`Сначала уберите вложения из поля «${target.label}», чтобы изменить его тип.`);
      }
    } else if (target.fileKind !== field.fileKind) {
      for (const { name } of db.prepare('SELECT name FROM catalog_attachments ' + inTable).iterate(table.id, field.key)) {
        if (!acceptsAttachment(target.fileKind, name)) {
          throw new CatalogError(`Файл «${name}» не подходит для новой категории поля «${target.label}». Сначала уберите его из записи.`);
        }
      }
    }
  }
}
