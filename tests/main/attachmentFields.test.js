import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createCatalog } from '../../src/main/catalog/createCatalog.js';
import { Database } from '../../src/main/database/Database.js';
import { CatalogError } from '../../src/shared/catalogError.js';

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  const staged = new Map();
  const catalog = createCatalog(db, { resolveStaged(id, owner) {
    const item = staged.get(id);
    if (item && item.tableId === owner.tableId && item.fieldKey === owner.fieldKey && item.recordId === owner.recordId) return item.file;
  } });
  function pick(tableId, fieldKey, name, recordId = null) {
    const file = { id: randomUUID(), name, size: 25 };
    staged.set(file.id, { tableId, fieldKey, recordId, file });
    return file;
  }
  return { catalog, pick };
}

test('поле хранит несколько файлов в заданном порядке, ищет и сортирует по именам', t => {
  const { catalog, pick } = fixture(t);
  const section = catalog.createTable({ name: 'Бумаги', fields: [{ type: 'files', label: 'Вложения' }] });
  const tableId = section.id;
  assert.equal(section.fields[0].fileKind, 'any');
  const first = pick(tableId, 'f_1', 'Акт 245.PDF');
  const second = pick(tableId, 'f_1', 'Фото.jpg');
  const row = catalog.saveRecord({ tableId, values: { f_1: [{ ...first, name: 'подмена', size: 1 }, second.id] } });
  assert.deepEqual(row.values.f_1, [first, second]);
  assert.deepEqual(catalog.getAttachment(first.id), first);
  const empty = catalog.saveRecord({ tableId, values: {} });
  assert.deepEqual(empty.values.f_1, []);
  const result = catalog.searchRecordGroups({ query: 'акт 245' })[0];
  assert.deepEqual(result.rows, [row]);
  assert.equal(catalog.searchRecords({ query: first.id }).total, 0);
  catalog.setTableSort({ tableId, sort: { key: 'f_1', direction: 'asc' } });
  assert.deepEqual(catalog.searchRecords({ tableId }).rows, [row, empty]);
  const sheets = catalog.exportSheets({ tableId, collectionId: null, query: '245', field: 'Вложения',
    sections: [{ tableId, fieldKeys: ['f_1'] }] });
  assert.deepEqual(sheets[0].rows, [row]);
  const reordered = catalog.saveRecord({ id: row.id, tableId, values: { f_1: [second.id, first.id] } });
  assert.deepEqual(catalog.searchRecords({ query: 'фото' }).rows, [reordered]);
  catalog.saveRecord({ id: row.id, tableId, values: { f_1: [second.id] } });
  assert.deepEqual(catalog.listRemovedAttachmentIds(), [first.id]);
  assert.throws(() => catalog.getAttachment(first.id), CatalogError);
  assert.equal(catalog.searchRecords({ query: '245' }).total, 0);
  catalog.deleteTable({ id: tableId });
  assert.deepEqual(catalog.listAttachments(), []);
  assert.deepEqual(new Set(catalog.listRemovedAttachmentIds()), new Set([first.id, second.id]));
  catalog.forgetRemovedAttachment(first.id);
  assert.deepEqual(catalog.listRemovedAttachmentIds(), [second.id]);
});

test('каталог проверяет принадлежность вложений, расширение и обязательность, не доверяет данным формы', t => {
  const { catalog, pick } = fixture(t);
  const { id: tableId } = catalog.createTable({ name: 'Снимки', fields: [
    { type: 'files', label: 'Фото', fileKind: 'image', required: true }, { type: 'files', label: 'Прочее' },
  ] });
  const photo = pick(tableId, 'f_1', 'Фото.JPG');
  const doc = pick(tableId, 'f_1', 'Записка.pdf');
  const save = (values, id) => catalog.saveRecord({ tableId, id, values });
  for (const files of [[], [doc], [photo, photo], [{ ...photo, id: randomUUID() }]]) {
    assert.throws(() => save({ f_1: files }), CatalogError);
  }
  assert.throws(() => save({ f_1: [photo], f_2: [photo] }), CatalogError);
  assert.equal(catalog.searchRecords().total, 0);
  const row = save({ f_1: [photo] });
  assert.throws(() => save({ f_1: [photo] }), CatalogError);
  assert.throws(() => save({ f_2: [photo.id] }, row.id), CatalogError);
  assert.throws(() => save({ f_1: [] }, row.id), CatalogError);
  assert.deepEqual(save({ f_2: [] }, row.id), row);
  const extra = pick(tableId, 'f_2', 'Нет расширения', row.id);
  save({ f_2: [extra.id] }, row.id);
  catalog.deleteRecord({ id: row.id, tableId });
  assert.deepEqual(new Set(catalog.listRemovedAttachmentIds()), new Set([photo.id, extra.id]));
  assert.throws(() => save({ f_1: [photo] }), CatalogError);
  assert.throws(() => catalog.getFileField({ tableId, fieldKey: 'f_1', recordId: row.id }), CatalogError);
});

test('изменения схемы сохраняют вложения и откатывают несовместимую смену типа', t => {
  const { catalog, pick } = fixture(t);
  const section = catalog.createTable({ name: 'Приёмка', fields: [
    { type: 'files', label: 'Сканы' }, { type: 'files', label: 'Приложения' }, { type: 'text', label: 'Номер' },
  ] });
  const { id: tableId, fields: [scan, extra, code] } = section;
  const pdf = pick(tableId, scan.key, 'Акт 245.pdf');
  const zip = pick(tableId, extra.key, 'Снимки.zip');
  const row = catalog.saveRecord({ tableId, values: { f_1: [pdf], f_2: [zip], f_3: '204' } });
  const change = (...fields) => catalog.updateTable({ id: tableId, fields });
  assert.throws(() => change({ ...extra, fileKind: 'image' }, code), CatalogError);
  assert.deepEqual(catalog.listRemovedAttachmentIds(), []);
  assert.deepEqual(catalog.searchRecords().rows, [row]);
  assert.throws(() => change(scan, extra, { ...code, type: 'files' }), CatalogError);
  assert.throws(() => change({ ...scan, type: 'text' }, extra, code), CatalogError);
  const copy = catalog.copyTableStructure({ sourceId: tableId, name: 'Новая приёмка' });
  assert.deepEqual(copy.fields, section.fields);
  assert.equal(catalog.searchRecords({ tableId: copy.id }).total, 0);
  const configured = change({ ...code, type: 'number' }, { ...scan, label: 'Акты', fileKind: 'document' });
  assert.deepEqual(catalog.searchRecords({ query: '245', field: 'Акты' }).rows[0].values, { f_3: 204, f_1: [pdf] });
  assert.equal(catalog.searchRecords({ query: 'Снимки.zip' }).total, 0);
  assert.deepEqual(catalog.listRemovedAttachmentIds(), [zip.id]);
  catalog.saveRecord({ tableId, id: row.id, values: { f_1: [] } });
  change(configured.fields[0], { ...scan, type: 'text' });
  assert.deepEqual(catalog.searchRecords().rows[0].values, { f_3: 204, f_1: null });
  change(configured.fields[0], scan);
  assert.deepEqual(catalog.searchRecords().rows[0].values, { f_3: 204, f_1: [] });
});
