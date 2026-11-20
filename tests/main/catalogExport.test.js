import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalog } from '../../src/main/catalog/createCatalog.js';
import { Database } from '../../src/main/database/Database.js';
import { CatalogError } from '../../src/shared/catalogError.js';

const all = { tableId: null, collectionId: null, query: '', field: '' };

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  return { catalog: createCatalog(db), db };
}

test('экспорт использует схемы, сортировки и фильтры реестра, выдаёт только выбранные поля', t => {
  const { catalog } = fixture(t);
  const disks = catalog.createTable({ name: 'Диски 245', fields: [
    { type: 'number', label: 'Номер' }, { type: 'checkbox', label: 'Выдан' }, { type: 'text', label: 'Комментарий' },
  ] });
  const docs = catalog.createTable({ name: 'Документы', fields: [
    { type: 'text', label: 'Номер' }, { type: 'date', label: 'Дата' },
  ] });
  const empty = catalog.createTable({ name: 'Пустой', fields: [{ type: 'month', label: 'Период' }] });
  const collection = catalog.saveCollection({ name: 'Архив', tableIds: [docs.id, disks.id, empty.id] });
  const stored = [
    catalog.saveRecord({ tableId: disks.id, values: { f_1: 2, f_2: false, f_3: 'Склад А' } }),
    catalog.saveRecord({ tableId: disks.id, values: { f_1: 10, f_2: true, f_3: 'Поиск: 245' } }),
    catalog.saveRecord({ tableId: disks.id, values: { f_1: null, f_2: null } }),
  ];
  const doc = catalog.saveRecord({ tableId: docs.id, values: { f_1: '№ 245', f_2: '2026-01-31' } });
  catalog.setTableSort({ tableId: disks.id, sort: { key: 'f_1', direction: 'asc' } });
  const sections = [
    { tableId: docs.id, fieldKeys: ['f_2'] },
    { tableId: disks.id, fieldKeys: ['f_2', 'f_3'] },
    { tableId: empty.id, fieldKeys: ['f_1'] },
  ];
  const [documents, drives, blank] = catalog.exportSheets({ ...all, sections });
  assert.deepEqual(documents, { name: docs.name, fields: [docs.fields[1]], rows: [{ ...doc, values: { f_2: '2026-01-31' } }] });
  assert.deepEqual(drives.fields.map(f => f.key), ['f_2', 'f_3']);
  assert.deepEqual(drives.rows.map(r => r.id), stored.map(r => r.id));
  assert.deepEqual(drives.rows.map(r => r.values), [
    { f_2: false, f_3: 'Склад А' }, { f_2: true, f_3: 'Поиск: 245' }, { f_2: null, f_3: null },
  ]);
  assert.deepEqual(blank, { name: empty.name, fields: empty.fields, rows: [] });
  for (const collectionId of [null, collection.id]) {
    assert.deepEqual(catalog.exportSheets({ ...all, collectionId, query: '245', sections }), [documents, drives]);
    assert.deepEqual(catalog.exportSheets({ ...all, collectionId, query: '245', field: 'НОМЕР', sections }), [documents]);
    assert.deepEqual(catalog.exportSheets({ ...all, collectionId, query: '31.01.2026', sections }), [documents]);
  }
  const [single] = catalog.exportSheets({ ...all, tableId: disks.id, query: '245', sections: [sections[1]] });
  assert.deepEqual(single.rows.map(row => row.id), [stored[1].id]);
  assert.deepEqual(catalog.exportSheets({ ...all, field: 'Период', sections }), []);
  assert.deepEqual(catalog.exportSheets({ ...all, tableId: empty.id, sections: [sections[2]] }), [blank]);
});

test('экспорт и реестр читают текст после нулевого символа, в том числе после изменения соседнего поля', t => {
  const { catalog } = fixture(t);
  const table = catalog.createTable({ name: 'Метки', fields: [{ type: 'text', label: 'Код' }, { type: 'number', label: 'Номер' }] });
  const text = 'Префикс\0Суффикс';
  const record = catalog.saveRecord({ tableId: table.id, values: { f_1: text, f_2: 1 } });
  const input = { ...all, tableId: table.id, query: 'суффикс', sections: [{ tableId: table.id, fieldKeys: ['f_1'] }] };
  assert.deepEqual(catalog.exportSheets(input)[0].rows[0].values, { f_1: text });
  const edited = catalog.saveRecord({ id: record.id, tableId: table.id, values: { f_2: 2 } });
  assert.equal(edited.values.f_1, text);
  catalog.setTableSort({ tableId: table.id, sort: { key: 'f_1', direction: 'asc' } });
  assert.deepEqual(catalog.searchRecords({ tableId: table.id, query: 'суффикс' }).rows, [edited]);
  assert.deepEqual(catalog.exportSheets(input)[0].rows[0].values, { f_1: text });
});

test('экспорт проверяет область, идентификаторы и выбранные поля по актуальной схеме', t => {
  const { catalog } = fixture(t);
  const first = catalog.createTable({ name: 'Товары', fields: [{ type: 'number', label: 'Код' }] });
  const second = catalog.createTable({ name: 'Акты', fields: first.fields });
  const collection = catalog.saveCollection({ name: 'Реестр', tableIds: [second.id] });
  const selected = { tableId: first.id, fieldKeys: ['f_1'] };
  const input = { ...all, sections: [selected] };
  for (const patch of [
    { sections: [] }, { sections: [null] }, { sections: [selected, selected] },
    { sections: [{ ...selected, tableId: 1234 }] }, { sections: [{ ...selected, tableId: String(first.id) }] },
    { sections: [{ ...selected, fieldKeys: [] }] }, { sections: [{ ...selected, fieldKeys: ['f_1', 'f_1'] }] },
    { tableId: second.id }, { tableId: first.id, collectionId: collection.id }, { collectionId: collection.id },
    { collectionId: 1234 }, { tableId: undefined }, { query: null }, { field: true },
  ]) assert.throws(() => catalog.exportSheets({ ...input, ...patch }), CatalogError);
  const renamed = catalog.updateTable({ id: first.id, name: 'Список', fields: [{ ...first.fields[0], label: 'Артикул' }] });
  assert.deepEqual(catalog.exportSheets(input), [{ name: 'Список', fields: renamed.fields, rows: [] }]);
  catalog.updateTable({ id: first.id, fields: [{ type: 'number', label: 'Код' }] });
  assert.throws(() => catalog.exportSheets(input), CatalogError);
});

test('экспорт сортирует целиком раздел, превышающий лимит SQL-параметров и размер страницы', t => {
  const { catalog, db } = fixture(t);
  const table = catalog.createTable({ name: 'Метки', fields: [{ type: 'text', label: 'Название' }, { type: 'number', label: 'Номер' }] });
  const count = 33000;
  db.open().exec(`
    WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM seq WHERE n < ${count})
    INSERT INTO catalog_records(table_id, search_values) SELECT ${table.id}, '{}' FROM seq;
    INSERT INTO inventory_${table.id}(id, f_1, f_2) SELECT id, 'Метка ' || id, id FROM catalog_records;
  `);
  const input = { ...all, sections: [{ tableId: table.id, fieldKeys: ['f_2'] }] };
  const [unsorted] = catalog.exportSheets(input);
  assert.equal(unsorted.rows.length, count);
  assert.equal(unsorted.rows[0].values.f_2, count);
  catalog.setTableSort({ tableId: table.id, sort: { key: 'f_1', direction: 'asc' } });
  const [sorted] = catalog.exportSheets(input);
  assert.equal(sorted.rows.length, count);
  assert.ok(sorted.rows.every((row, i) => row.values.f_2 === i + 1 && !('f_1' in row.values)));
});
