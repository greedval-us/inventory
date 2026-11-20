import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createCatalog } from '../../src/main/catalog/createCatalog.js';
import { Database } from '../../src/main/database/Database.js';
import { migrations } from '../../src/main/database/migrations.js';
import { CatalogError } from '../../src/shared/catalogError.js';
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from '../../src/shared/columnWidths.js';

test('ширина привязана к разделу и постоянному ключу поля, в том числе после обновления и перезапуска', t => {
  const directory = mkdtempSync(join(tmpdir(), 'inventory-width-'));
  const file = join(directory, 'inventory.sqlite');
  const database = new Database(file);
  t.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
  // Populate the last published schema before opening it through the current migration runner.
  const previous = new DatabaseSync(file);
  const fields = [{ type: 'text', label: 'Код' }, { type: 'number', label: 'Объём' }];
  let disks, docs;
  try {
    previous.exec('PRAGMA foreign_keys = ON; PRAGMA application_id = 0x494e5654; PRAGMA user_version = 5;');
    for (const migration of migrations.slice(0, 5)) previous.exec(migration);
    const old = createCatalog({ open: () => previous });
    disks = old.createTable({ name: 'Диски', fields });
    docs = old.createTable({ name: 'Документы', fields });
    old.saveRecord({ tableId: disks.id, values: { f_1: 'SSD-245', f_2: 1024 } });
    old.setTableSort({ tableId: disks.id, sort: { key: 'f_1', direction: 'desc' } });
  } finally {
    previous.close();
  }
  const catalog = createCatalog(database);
  assert.deepEqual(catalog.listColumnWidths(), {});
  assert.deepEqual(catalog.searchRecords({ tableId: disks.id }).rows[0].values, { f_1: 'SSD-245', f_2: 1024 });
  assert.deepEqual(catalog.listTableSorts(), { [disks.id]: { key: 'f_1', direction: 'desc' } });
  const save = (tableId, fieldKey, width) => catalog.setColumnWidth({ tableId, fieldKey, width });
  save(disks.id, 'f_1', 105);
  save(docs.id, 'f_1', MIN_COLUMN_WIDTH);
  save(disks.id, 'f_2', MAX_COLUMN_WIDTH);
  assert.equal(save(disks.id, 'f_1', 246), 246);
  const expected = { [disks.id]: { f_1: 246, f_2: MAX_COLUMN_WIDTH }, [docs.id]: { f_1: MIN_COLUMN_WIDTH } };
  database.close();
  assert.deepEqual(catalog.listColumnWidths(), expected);
  catalog.saveCollection({ name: 'Каталог', tableIds: [disks.id, docs.id] });
  catalog.updateTable({ id: disks.id, fields: [disks.fields[1], { ...disks.fields[0], label: 'Номер' }] });
  assert.deepEqual(catalog.listColumnWidths(), expected);
  const updated = catalog.updateTable({ id: disks.id, fields: [disks.fields[0], { type: 'number', label: 'Объём' }] });
  assert.notEqual(updated.fields[1].key, disks.fields[1].key);
  assert.deepEqual(catalog.listColumnWidths(), { [disks.id]: { f_1: 246 }, [docs.id]: { f_1: MIN_COLUMN_WIDTH } });
  catalog.deleteTable({ id: disks.id });
  database.close();
  assert.deepEqual(catalog.listColumnWidths(), { [docs.id]: { f_1: MIN_COLUMN_WIDTH } });
});

test('проверяет диапазон ширины, принадлежность столбца и сохраняет последнее допустимое значение', t => {
  const database = new Database(':memory:');
  t.after(() => database.close());
  const catalog = createCatalog(database);
  const table = catalog.createTable({ name: 'Склад', fields: [{ type: 'text', label: 'Место' }] });
  const input = { tableId: table.id, fieldKey: table.fields[0].key, width: 245 };
  catalog.setColumnWidth(input);
  for (const width of [0, MIN_COLUMN_WIDTH - 1, MAX_COLUMN_WIDTH + 1, 75.5, null, '160', Infinity]) {
    assert.throws(() => catalog.setColumnWidth({ ...input, width }), CatalogError);
  }
  for (const patch of [{ tableId: 0 }, { tableId: table.id + 1 }, { fieldKey: 'Место' }, { fieldKey: 'f_2' }]) {
    assert.throws(() => catalog.setColumnWidth({ ...input, ...patch }), CatalogError);
  }
  assert.deepEqual(catalog.listColumnWidths(), { [table.id]: { [input.fieldKey]: 245 } });
});
