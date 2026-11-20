import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../../src/main/database/Database.js';
import { createCatalog } from '../../src/main/catalog/createCatalog.js';
import { physicalName } from '../../src/main/catalog/tableStorage.js';

function fixture(t, fields) {
  const database = new Database(':memory:');
  t.after(() => database.close());
  const catalog = createCatalog(database);
  const table = catalog.createTable({ name: 'Учёт', fields });
  const add = rows => catalog.importRecords({ tableId: table.id, fields: table.fields, rows });
  return { database, catalog, table, add };
}

test('импорт дополняет раздел и индексирует нормализованные значения всех новых записей', t => {
  const { catalog, table, add } = fixture(t, [
    { label: 'Код', type: 'text', required: true },
    { label: 'Срок', type: 'date' },
    { label: 'Проверен', type: 'checkbox' },
    { label: 'Вложение', type: 'files' },
  ]);
  assert.deepEqual(catalog.getTable(table.id), table);
  const prior = catalog.saveRecord({ tableId: table.id, values: { f_1: 'До импорта' } });
  assert.deepEqual(add([]), { added: 0 });
  assert.deepEqual(add([
    { f_1: '  Ключ-245  ', f_2: '30.04.2026', f_3: false },
    { f_1: 'Блок-245', f_3: true },
  ]), { added: 2 });
  assert.deepEqual(catalog.searchRecords({ query: 'до импорта' }).rows, [prior]);
  const added = catalog.searchRecords({ query: '245' }).rows.sort((a, b) => a.id - b.id);
  assert.deepEqual(added.map(row => row.values), [
    { f_1: '  Ключ-245  ', f_2: '2026-04-30', f_3: false, f_4: [] },
    { f_1: 'Блок-245', f_2: null, f_3: true, f_4: [] },
  ]);
  assert.deepEqual(catalog.searchRecords({ query: '30.04.2026', field: 'Срок' }).rows, [added[0]]);
});

test('ошибка в конце пакета откатывает данные и поисковый индекс, после исправления импорт можно повторить', t => {
  const { catalog, table, add } = fixture(t, [{ label: 'Код', type: 'text', required: true }]);
  const prior = catalog.saveRecord({ tableId: table.id, values: { f_1: 'Исходная строка' } });
  for (const [invalid, message] of [[{}, /Код/], [{ f_1: 'Ошибка', f_9: true }, /неизвестный столбец/]]) {
    assert.throws(() => add([{ f_1: 'Новая строка' }, invalid]), message);
    assert.deepEqual(catalog.searchRecords({ tableId: table.id }).rows, [prior]);
    assert.deepEqual(catalog.searchRecords({ query: 'Новая' }).rows, []);
  }
  assert.deepEqual(add([{ f_1: 'Новая строка' }, { f_1: 'Исправленная' }]), { added: 2 });
  assert.equal(catalog.searchRecords({ tableId: table.id }).total, 3);
});

test('изменение полей после просмотра блокирует импорт до нового сопоставления', t => {
  const { catalog, table, add } = fixture(t, [
    { label: 'Название', type: 'text' }, { label: 'Статус', type: 'select', options: ['Склад'] },
  ]);
  const [title, status] = table.fields;
  for (const fields of [
    [status, title],
    [{ ...title, type: 'number' }, status],
    [{ ...title, required: true }, status],
    [title, { ...status, options: ['Склад', 'Офис'] }],
    [{ ...title, label: 'Модель' }, status],
  ]) {
    const changed = catalog.updateTable({ id: table.id, fields });
    assert.throws(() => add([{ f_1: 'Сканер' }]), /поля|структур/i);
    assert.deepEqual(catalog.searchRecords({ tableId: table.id }).rows, []);
    assert.deepEqual(catalog.getTable(table.id).fields, changed.fields);
  }
  assert.deepEqual(catalog.importRecords({
    tableId: table.id, fields: catalog.getTable(table.id).fields, rows: [{ f_1: 'Сканер' }],
  }), { added: 1 });
});

test('сбой SQLite после индексации строки откатывает обе таблицы целиком', t => {
  const { database, catalog, table, add } = fixture(t, [{ label: 'Номер', type: 'number' }]);
  catalog.saveRecord({ tableId: table.id, values: { f_1: 0 } });
  const db = database.open();
  const physical = physicalName(table.id);
  db.exec(`CREATE TRIGGER fail_import BEFORE INSERT ON ${physical} WHEN NEW.f_1 = 2
    BEGIN SELECT RAISE(ABORT, 'fail_import'); END`);
  assert.throws(() => add([{ f_1: 1 }, { f_1: 2 }]), /fail_import/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM catalog_records').get().n, 1);
  assert.deepEqual(db.prepare(`SELECT f_1 FROM ${physical}`).all().map(row => row.f_1), [0]);
});

test('при импорте сохраняется требование обязательного вложения', t => {
  const { catalog, table, add } = fixture(t, [{ label: 'Подтверждение', type: 'files', required: true }]);
  assert.throws(() => add([{}]), /Подтверждение/);
  assert.deepEqual(catalog.searchRecords({ tableId: table.id }).rows, []);
});
