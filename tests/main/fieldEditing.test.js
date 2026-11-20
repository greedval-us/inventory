import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../../src/main/database/Database.js';
import { createCatalog } from '../../src/main/catalog/createCatalog.js';
import { CatalogError } from '../../src/shared/catalogError.js';

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  return { db, catalog: createCatalog(db) };
}

test('перестановка, переименование и замена полей сохраняют значения по ключам и обновляют поиск', t => {
  const { catalog } = fixture(t);
  const table = catalog.createTable({ name: 'Диски', fields: [
    { label: 'Модель', type: 'text' }, { label: 'Цена', type: 'number' }, { label: 'Дата', type: 'date' },
    { label: 'Продан', type: 'checkbox' }, { label: 'Статус', type: 'select', options: ['А', 'Б'] },
  ] });
  const record = catalog.saveRecord({ tableId: table.id, values: {
    f_1: '250-EVO', f_2: 1.25, f_3: '2026-02-03', f_4: false, f_5: 'Б',
  } });
  const updated = catalog.updateTable({ id: table.id, expectedFields: table.fields, fields: [
    table.fields[4], { ...table.fields[1], label: 'Стоимость' }, { label: 'Приобретён', type: 'checkbox' },
    table.fields[2], table.fields[3],
  ] });
  assert.deepEqual(updated.fields.map(f => f.key), ['f_5', 'f_2', 'f_6', 'f_3', 'f_4']);
  assert.deepEqual(catalog.searchRecords().rows, [{ id: record.id, tableId: table.id,
    values: { f_5: 'Б', f_2: 1.25, f_6: null, f_3: '2026-02-03', f_4: false },
  }]);
  for (const [field, query] of [['Стоимость', '1,25'], ['Дата', '03.02.2026'], ['Продан', 'нет'], ['Статус', 'Б']]) {
    assert.equal(catalog.searchRecords({ field, query }).total, 1);
  }
  assert.equal(catalog.searchRecords({ field: 'Приобретён' }).total, 1);
  assert.equal(catalog.searchRecords({ field: 'Приобретён', query: 'нет' }).total, 0);
  assert.equal(catalog.searchRecords({ field: 'Цена' }).total, 0);
  assert.equal(catalog.searchRecords({ query: 'EVO' }).total, 0);
  assert.throws(() => catalog.updateTable({ id: table.id, fields: table.fields, expectedFields: table.fields }), CatalogError);
  assert.throws(() => catalog.saveRecord({ tableId: table.id, id: record.id, values: { f_1: 'Устаревшая запись' } }), CatalogError);
  catalog.saveRecord({ tableId: table.id, id: record.id, values: { f_6: true } });
  assert.equal(catalog.searchRecords({ field: 'Приобретён', query: 'да' }).rows[0].values.f_2, 1.25);
});

test('сбой перестройки откатывает таблицу, данные, индекс и счётчик столбцов', t => {
  const { db, catalog } = fixture(t);
  const table = catalog.createTable({ name: 'Журнал', fields: [{ label: 'Тема', type: 'text' }] });
  const record = catalog.saveRecord({ tableId: table.id, values: { f_1: 'Отчёт' } });
  const sql = db.open();
  sql.exec("CREATE TRIGGER fail_reindex BEFORE UPDATE OF search_values ON catalog_records BEGIN SELECT RAISE(ABORT, 'failed'); END");
  const replacement = { id: table.id, name: 'Журналы', fields: [{ label: 'Закрыт', type: 'checkbox' }] };
  assert.throws(() => catalog.updateTable(replacement), /failed/);
  assert.deepEqual(catalog.listTables(), [table]);
  assert.deepEqual(catalog.searchRecords({ query: 'отчёт' }).rows, [record]);
  sql.exec('DROP TRIGGER fail_reindex');
  const changed = catalog.updateTable(replacement);
  assert.equal(changed.fields[0].key, 'f_2');
  assert.deepEqual(catalog.searchRecords().rows[0].values, { f_2: null });
  for (const fields of [
    [], [{ key: 'f_99', label: 'Другое', type: 'text' }],
    [changed.fields[0], { ...changed.fields[0], label: 'Дубликат' }],
    [changed.fields[0], { label: ' закрыт ', type: 'date' }],
  ]) assert.throws(() => catalog.updateTable({ id: table.id, fields }), CatalogError);
  assert.deepEqual(catalog.listTables(), [changed]);
});

test('перенос меняет только коллекцию и поддерживает вывод раздела из коллекции', t => {
  const { catalog } = fixture(t);
  const section = catalog.createTable({ name: 'Диски', fields: [{ label: 'Модель', type: 'text' }] });
  const record = catalog.saveRecord({ tableId: section.id, values: { f_1: 'A-245' } });
  const first = catalog.saveCollection({ name: 'Поставка', tableIds: [section.id] });
  const second = catalog.saveCollection({ name: 'Склад', tableIds: [] });
  const renamed = catalog.updateTable({ id: section.id, name: 'Накопители' });
  assert.deepEqual(catalog.moveTable({ id: section.id, collectionId: second.id }), { ...renamed, collectionId: second.id });
  assert.deepEqual(catalog.searchRecordGroups({ collectionId: first.id }), []);
  assert.deepEqual(catalog.searchRecordGroups({ collectionId: second.id })[0].rows, [record]);
  for (const collectionId of [undefined, 999, '1']) {
    assert.throws(() => catalog.moveTable({ id: section.id, collectionId }), CatalogError);
  }
  assert.deepEqual(catalog.moveTable({ id: section.id, collectionId: null }), { ...renamed, collectionId: null });
  assert.deepEqual(catalog.searchRecords().rows, [record]);
});
