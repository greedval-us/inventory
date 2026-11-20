import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCatalog } from '../../src/main/catalog/createCatalog.js';
import { Database } from '../../src/main/database/Database.js';
import { CatalogError } from '../../src/shared/catalogError.js';

function fixture(t, onDisk = false) {
  const dir = onDisk ? mkdtempSync(join(tmpdir(), 'inventory-types-')) : null;
  const db = new Database(dir ? join(dir, 'test.sqlite') : ':memory:');
  t.after(() => {
    db.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  return { db, catalog: createCatalog(db) };
}

test('список охватывает все страницы, объединяет варианты и сохраняет каждую строку после открытия базы', t => {
  const { db, catalog } = fixture(t, true);
  const table = catalog.createTable({ name: 'Техника', fields: [
    { label: 'Место', type: 'text' }, { label: 'Номер', type: 'text' },
    { label: 'Состояние', type: 'select', options: ['Старое', 'Другое'] },
  ] });
  const names = ['  Офис  ', 'офис', null, 'И\u0306', 'Й', ...Array.from({ length: 55 }, (_, i) => `Склад ${i + 1}`)];
  const save = value => catalog.saveRecord({ tableId: table.id, values: { f_1: value, f_2: '001', f_3: 'Старое' } });
  const records = names.map(save);
  const preview = catalog.previewFieldOptions({ tableId: table.id, fieldKey: 'f_1' });
  assert.deepEqual(preview, { options: ['Офис', 'И\u0306', ...names.slice(5, 11)], total: 57 });
  for (const input of [{ tableId: '1', fieldKey: 'f_1' }, { tableId: 999, fieldKey: 'f_1' }, { tableId: table.id, fieldKey: 'id' }]) {
    assert.throws(() => catalog.previewFieldOptions(input), CatalogError);
  }
  const latest = save('Резерв');
  const updated = catalog.updateTable({ id: table.id, expectedFields: table.fields, fields: [
    { ...table.fields[2], options: ['Новое', 'Другое'], optionSources: ['Старое', 'Другое'] },
    { ...table.fields[0], type: 'select', required: true, options: ['оФиС', 'Архив'] },
    table.fields[1],
  ] });
  const expectedOptions = ['Офис', 'И\u0306', ...names.slice(5), 'Резерв', 'Архив'];
  assert.deepEqual(updated.fields[1].options, expectedOptions);
  db.close();
  assert.deepEqual(catalog.listTables(), [updated]);
  const rows = catalog.searchRecords({ tableId: table.id, limit: 100 }).rows.toReversed();
  assert.deepEqual(rows.map(row => row.id), [...records, latest].map(record => record.id));
  assert.deepEqual(rows.map(row => row.values.f_1), ['Офис', 'Офис', null, 'И\u0306', 'И\u0306', ...names.slice(5), 'Резерв']);
  assert.ok(rows.every(row => row.values.f_2 === '001' && row.values.f_3 === 'Новое'));
  assert.deepEqual(catalog.searchRecordGroups({ query: 'езер' })[0].rows, [rows.at(-1)]);
  assert.equal(catalog.searchRecords({ query: 'старое' }).total, 0);
  assert.equal(catalog.saveRecord({ id: latest.id, tableId: table.id, values: { f_1: 'архив' } }).values.f_1, 'Архив');
});

test('пустой столбец требует ручного варианта, обязательность не подставляет значение в старые строки', t => {
  const { catalog } = fixture(t);
  const table = catalog.createTable({ name: 'Диски', fields: [{ label: 'Марка', type: 'text' }] });
  const row = catalog.saveRecord({ tableId: table.id, values: { f_1: null } });
  const field = { ...table.fields[0], type: 'select', required: true };
  assert.deepEqual(catalog.previewFieldOptions({ tableId: table.id, fieldKey: field.key }), { options: [], total: 0 });
  assert.throws(() => catalog.updateTable({ id: table.id, fields: [field] }), /Добавьте хотя бы один вариант.*Марка/);
  assert.deepEqual(catalog.listTables(), [table]);
  const result = catalog.updateTable({ id: table.id, fields: [{ ...field, options: ['WD'] }] });
  assert.deepEqual(result.fields[0].options, ['WD']);
  assert.deepEqual(catalog.searchRecords().rows, [row]);
  assert.throws(() => catalog.saveRecord({ tableId: table.id, values: {} }), /обязательное/);
});

test('преобразование меняет тип хранения и индекс поиска при неизменных названиях полей', t => {
  const { db, catalog } = fixture(t);
  const table = catalog.createTable({ name: 'Карточки', fields: [
    { label: 'Цена', type: 'select', options: ['+001,2500', '2'] }, { label: 'Получен', type: 'text' },
    { label: 'Наличие', type: 'number' }, { label: 'Проверен', type: 'checkbox' },
    { label: 'Закрыт', type: 'checkbox' }, { label: 'День', type: 'date' }, { label: 'Начало', type: 'month' },
  ] });
  const row = catalog.saveRecord({ tableId: table.id, values: {
    f_1: '+001,2500', f_2: '29.02.2024 15:03', f_3: 0, f_4: false, f_5: true, f_6: '2025-09-01', f_7: '2025-09',
  } });
  assert.deepEqual(catalog.previewFieldOptions({ tableId: table.id, fieldKey: 'f_4' }).options, ['Нет']);
  const types = ['number', 'datetime', 'checkbox', 'select', 'number', 'month', 'datetime'];
  const update = catalog.updateTable({ id: table.id, fields: table.fields.map((field, i) => ({ ...field, type: types[i] })) });
  assert.deepEqual(update.fields[3].options, ['Нет']);
  assert.ok(!('options' in update.fields[0]));
  assert.deepEqual(catalog.searchRecords().rows, [{ ...row, values: {
    f_1: 1.25, f_2: '2024-02-29T15:03', f_3: false, f_4: 'Нет', f_5: 1, f_6: '2025-09', f_7: '2025-09-01T00:00',
  } }]);
  assert.deepEqual(db.open().prepare('PRAGMA table_info(inventory_1)').all().map(col => col.type),
    ['INTEGER', 'REAL', 'TEXT', 'INTEGER', 'TEXT', 'REAL', 'TEXT', 'TEXT']);
  assert.equal(catalog.searchRecords({ field: 'Наличие', query: 'нет' }).total, 1);
  assert.equal(catalog.searchRecords({ field: 'Цена', query: '+001' }).total, 0);
  assert.equal(catalog.searchRecords({ field: 'Цена', query: '1,25' }).total, 1);
  assert.deepEqual(catalog.previewFieldOptions({ tableId: table.id, fieldKey: 'f_2' }).options, ['29.02.2024 15:03']);
  const text = catalog.updateTable({ id: table.id, fields: update.fields.map(field => ({ ...field, type: 'text' })) });
  assert.ok(text.fields.every(field => field.type === 'text'));
  assert.deepEqual(catalog.searchRecords().rows[0].values, {
    f_1: '1.25', f_2: '29.02.2024 15:03', f_3: 'Нет', f_4: 'Нет', f_5: '1', f_6: '09.2025', f_7: '01.09.2025 00:00',
  });
});

test('несовместимая ячейка останавливает весь пакет правок и сообщает запись, поле и значение', t => {
  const { db, catalog } = fixture(t);
  const table = catalog.createTable({ name: 'Исходный', fields: [
    { label: 'Количество', type: 'text' }, { label: 'Отметка', type: 'text' },
    { label: 'Группа', type: 'select', options: ['A', 'B'] },
  ] });
  catalog.saveRecord({ tableId: table.id, values: { f_1: '12', f_2: 'Оставить', f_3: 'A' } });
  const row = catalog.saveRecord({ tableId: table.id, values: { f_1: '12 шт.', f_2: 'Сохранить', f_3: 'B' } });
  const patch = { id: table.id, name: 'Новый', fields: [
    { label: 'Другой столбец', type: 'number' }, { ...table.fields[0], type: 'number' },
    { ...table.fields[2], options: ['Замена'], optionSources: ['A'] },
  ] };
  const initialRows = catalog.searchRecords().rows;
  assert.throws(() => catalog.updateTable(patch), error => error instanceof CatalogError &&
    error.message.includes('Количество') && error.message.includes(`№${row.id}`) && error.message.includes('12 шт.'));
  assert.deepEqual(catalog.listTables(), [table]);
  assert.deepEqual(catalog.searchRecords().rows, initialRows);
  assert.deepEqual(catalog.searchRecords({ query: 'сохранить' }).rows, [row]);
  for (const bad of ['9007199254740993', '1000000000000000100', '0.123456789012345678', '1e-500']) {
    catalog.saveRecord({ id: row.id, tableId: table.id, values: { f_1: bad } });
    assert.throws(() => catalog.updateTable(patch), error => error instanceof CatalogError && error.message.includes(bad));
  }
  const nul = 'Начало\0Хвост';
  catalog.saveRecord({ id: row.id, tableId: table.id, values: { f_1: nul } });
  assert.throws(() => catalog.previewFieldOptions({ tableId: table.id, fieldKey: 'f_1' }), /Начало␀Хвост/);
  assert.throws(() => catalog.updateTable({ id: table.id, fields: [{ ...table.fields[0], type: 'select' }] }), /Начало␀Хвост/);
  assert.deepEqual(catalog.listTables(), [table]);
  assert.equal(db.open().prepare('SELECT hex(f_1) AS raw FROM inventory_1 WHERE id=?').get(row.id).raw,
    Buffer.from(nul).toString('hex').toUpperCase());
  catalog.saveRecord({ id: row.id, tableId: table.id, values: { f_1: '4e2' } });
  assert.equal(catalog.updateTable(patch).fields[0].key, 'f_4');
  assert.equal(catalog.searchRecords().rows[0].values.f_1, 400);
});

test('сокращение точности даты разрешается только при обратимом преобразовании', t => {
  const { catalog } = fixture(t);
  const table = catalog.createTable({ name: 'Даты', fields: [{ label: 'Время', type: 'datetime' }] });
  const row = catalog.saveRecord({ tableId: table.id, values: { f_1: '2025-05-01T12:15' } });
  const change = type => catalog.updateTable({ id: table.id, fields: [{ ...table.fields[0], type }] });
  for (const type of ['date', 'month']) assert.throws(() => change(type), /2025-05-01T12:15/);
  catalog.saveRecord({ id: row.id, tableId: table.id, values: { f_1: '2025-05-14T00:00' } });
  change('date');
  assert.equal(catalog.searchRecords().rows[0].values.f_1, '2025-05-14');
  assert.throws(() => change('month'), /2025-05-14/);
  catalog.saveRecord({ id: row.id, tableId: table.id, values: { f_1: '2025-05-01' } });
  change('month');
  change('datetime');
  assert.equal(catalog.searchRecords().rows[0].values.f_1, '2025-05-01T00:00');
});
