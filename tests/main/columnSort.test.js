import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../src/main/database/Database.js';
import { createCatalog } from '../../src/main/catalog/createCatalog.js';
import { CatalogError } from '../../src/shared/catalogError.js';

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  return createCatalog(db);
}

test('сортировка учитывает типы всех полей, меняет направление и оставляет пустые ячейки в конце', t => {
  const catalog = fixture(t);
  const fields = ['text', 'number', 'date', 'month', 'datetime', 'checkbox', 'select'].map(type => ({
    label: type, type, ...(type === 'select' ? { options: ['Якорь', 'яблоко', 'Архив'] } : {}),
  }));
  const table = catalog.createTable({ name: 'Материалы', fields });
  const values = [
    ['Якорь', 100, '2024-03-01', '2024-03', '2024-03-01T00:00', true, 'Якорь'],
    ['яблоко 10', 2, '2023-12-31', '2023-12', '2023-12-31T23:59', false, 'яблоко'],
    ['Яблоко 2', -10, '2024-02-29', '2024-02', '2023-12-31T15:00', false, 'Архив'],
    ['яблоко 2', 2, '2024-02-29', '2024-02', '2023-12-31T15:00', true, 'Архив'],
    Array(fields.length).fill(null),
  ];
  const records = values.map(row => catalog.saveRecord({ tableId: table.id,
    values: Object.fromEntries(table.fields.map(({ key }, i) => [key, row[i]])),
  }));
  // Indices refer to the input rows. Equal values use the newest record first.
  const expected = [
    [[3, 2, 1, 0, 4], [0, 1, 3, 2, 4]],
    [[2, 3, 1, 0, 4], [0, 3, 1, 2, 4]],
    [[1, 3, 2, 0, 4], [0, 3, 2, 1, 4]],
    [[1, 3, 2, 0, 4], [0, 3, 2, 1, 4]],
    [[3, 2, 1, 0, 4], [0, 1, 3, 2, 4]],
    [[2, 1, 3, 0, 4], [3, 0, 2, 1, 4]],
    [[3, 2, 1, 0, 4], [0, 1, 3, 2, 4]],
  ];
  for (const [index, { key }] of table.fields.entries()) {
    for (const [directionIndex, direction] of ['asc', 'desc'].entries()) {
      const ids = [];
      for (const offset of [0, 2, 4]) {
        const page = catalog.searchRecords({ tableId: table.id, offset, limit: 2, sort: { key, direction } });
        ids.push(...page.rows.map(row => row.id));
        assert.equal(page.total, records.length);
      }
      assert.deepEqual(ids, expected[index][directionIndex].map(i => records[i].id), fields[index].type + ' ' + direction);
    }
  }
  assert.throws(() => catalog.searchRecords({ tableId: table.id, sort: { key: 'deleted', direction: 'asc' } }), CatalogError);
  assert.throws(() => catalog.searchRecords({ tableId: table.id, sort: { key: 'f_1', direction: 'unexpected' } }), CatalogError);
});

test('глобальный поиск, коллекция и независимые страницы разделов используют выбранный порядок', t => {
  const catalog = fixture(t);
  const collection = catalog.saveCollection({ name: 'Учёт', tableIds: [] });
  const table = name => catalog.createTable({ name, collectionId: collection.id, fields: [{ label: 'Инвентарный номер', type: 'number' }] });
  const disks = table('Диски');
  const docs = table('Документы');
  for (const section of [disks, docs]) {
    for (const value of [9, 2450, 245, 1245]) catalog.saveRecord({ tableId: section.id, values: { f_1: value } });
  }
  const sorts = { [disks.id]: { key: 'f_1', direction: 'asc' }, [docs.id]: { key: 'f_1', direction: 'desc' } };
  for (const collectionId of [undefined, collection.id]) {
    const groups = catalog.searchRecordGroups({ query: '245', collectionId, limit: 2, offsets: { [docs.id]: 2 }, sorts });
    assert.deepEqual(groups.map(group => [group.offset, group.total, group.rows.map(row => row.values.f_1)]), [
      [0, 3, [245, 1245]], [2, 3, [245]],
    ]);
  }
});

test('восстанавливает сортировки разделов из SQLite и сохраняет сброс к порядку добавления', t => {
  const directory = mkdtempSync(join(tmpdir(), 'inventory-sort-'));
  const db = new Database(join(directory, 'inventory.sqlite'));
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  let catalog = createCatalog(db);
  const tables = ['Шкафы', 'Полки'].map(name => catalog.createTable({
    name, fields: [{ type: 'text', label: 'Номер' }, { type: 'text', label: 'Место' }],
  }));
  for (const table of tables) {
    for (const value of ['2', '1', '3']) {
      catalog.saveRecord({ tableId: table.id, values: { f_1: value } });
    }
  }
  const [a, b] = tables;
  const asc = { key: 'f_1', direction: 'asc' };
  const desc = { key: 'f_1', direction: 'desc' };
  const reopen = () => { db.close(); catalog = createCatalog(db); };
  const groups = options => catalog.searchRecordGroups(options).map(group => group.rows.map(row => row.values.f_1));
  assert.deepEqual(catalog.listTableSorts(), {});
  assert.deepEqual(catalog.setTableSort({ tableId: a.id, sort: asc }), asc);
  catalog.setTableSort({ tableId: b.id, sort: desc });
  reopen();
  assert.deepEqual(catalog.listTableSorts(), { [a.id]: asc, [b.id]: desc });
  assert.deepEqual(groups(), [['1', '2', '3'], ['3', '2', '1']]);
  assert.deepEqual(groups({ sorts: {} }), [['3', '1', '2'], ['3', '1', '2']]);
  assert.deepEqual(catalog.searchRecords({ tableId: a.id, limit: 2 }).rows.map(r => r.values.f_1), ['1', '2']);
  assert.deepEqual(catalog.searchRecords({ tableId: a.id, sort: null, limit: 2 }).rows.map(r => r.values.f_1), ['3', '1']);
  for (const sort of [undefined, { key: 'not_a_field', direction: 'asc' }, { ...asc, direction: 'other' }]) {
    assert.throws(() => catalog.setTableSort({ tableId: a.id, sort }), CatalogError);
  }
  assert.deepEqual(catalog.listTableSorts()[a.id], asc);
  assert.equal(catalog.setTableSort({ tableId: a.id, sort: null }), null);
  reopen();
  assert.deepEqual(catalog.listTableSorts(), { [b.id]: desc });
  assert.deepEqual(groups(), [['3', '1', '2'], ['3', '2', '1']]);

  const collection = catalog.saveCollection({ name: 'Мебель', tableIds: [b.id] });
  catalog.updateTable({ id: b.id, name: 'Полки в архиве', fields: [b.fields[1], { ...b.fields[0], label: 'Код', type: 'number' }] });
  assert.deepEqual(groups({ collectionId: collection.id }), [[3, 2, 1]]);
  catalog.updateTable({ id: b.id, fields: [b.fields[1], { label: 'Код', type: 'text' }] });
  assert.deepEqual(catalog.listTableSorts(), {});
  catalog.setTableSort({ tableId: a.id, sort: desc });
  catalog.deleteTable({ id: a.id });
  reopen();
  assert.deepEqual(catalog.listTableSorts(), {});
});
