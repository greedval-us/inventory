import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../../src/main/database/Database.js';
import { createCatalog } from '../../src/main/catalog/createCatalog.js';
import { CatalogError } from '../../src/shared/catalogError.js';
import { formatTemporalValue } from '../../src/shared/catalogFields.js';

function fixture(t) {
  const database = new Database(':memory:');
  t.after(() => database.close());
  return createCatalog(database);
}

test('обязательные поля проверяются при сохранении, включая старые строки; 0 и Нет сохраняются', t => {
  const catalog = fixture(t);
  const table = catalog.createTable({ name: 'Приборы', fields: [
    { label: 'Код', type: 'text' }, { label: 'Количество', type: 'number' },
    { label: 'Проверен', type: 'checkbox' }, { label: 'Тип', type: 'select', options: ['Новый'] },
  ] });
  const prior = catalog.saveRecord({ tableId: table.id, values: { f_1: 'TK-245', f_2: 0, f_4: 'Новый' } });
  catalog.updateTable({ id: table.id, fields: table.fields.map(field => ({ ...field, required: true })) });
  assert.deepEqual(catalog.searchRecords({ tableId: table.id }).rows, [prior]);
  const update = values => catalog.saveRecord({ tableId: table.id, id: prior.id, values });
  assert.throws(() => update({ f_1: 'Другое' }), /Проверен/);
  assert.deepEqual(catalog.searchRecords({ tableId: table.id }).rows, [prior]);
  const complete = update({ f_3: false });
  assert.deepEqual(complete.values, { f_1: 'TK-245', f_2: 0, f_3: false, f_4: 'Новый' });
  for (const [key, invalid] of Object.entries({ f_1: '  ', f_2: '', f_3: null, f_4: ' ' })) {
    assert.throws(() => update({ [key]: invalid }), CatalogError);
  }
  assert.throws(() => catalog.saveRecord({ tableId: table.id, values: { f_1: 'TK' } }), /Количество/);
  assert.deepEqual(catalog.searchRecords({ tableId: table.id }).rows, [complete]);
});

test('год и месяц, местная дата и время сохраняются и ищутся в русском и ISO-формате', t => {
  const catalog = fixture(t);
  const table = catalog.createTable({ name: 'Обслуживание', fields: [
    { label: 'Период', type: 'month', required: true },
    { label: 'Приём', type: 'datetime', required: true },
    { label: 'Срок', type: 'date', required: true },
  ] });
  const save = values => catalog.saveRecord({ tableId: table.id, values });
  const row = save({ f_1: '02.2024', f_2: '29.02.2024 23:51', f_3: '29.02.2024' });
  assert.deepEqual(row.values, { f_1: '2024-02', f_2: '2024-02-29T23:51', f_3: '2024-02-29' });
  assert.equal(formatTemporalValue('month', row.values.f_1), '02.2024');
  assert.equal(formatTemporalValue('datetime', row.values.f_2), '29.02.2024 23:51');
  assert.equal(formatTemporalValue('date', row.values.f_3), '29.02.2024');
  for (const [field, query] of [
    ['Период', '02.2024'], ['Период', '2024-02'],
    ['Приём', '29.02.2024 23:51'], ['Приём', '2024-02-29T23:51'], ['Срок', '29.02'],
  ]) {
    assert.deepEqual(catalog.searchRecords({ field, query }).rows, [row]);
  }
  for (const [key, values] of Object.entries({
    f_1: [null, '2026-13', '2024-00', '22.11.2024'],
    f_2: [null, '2023-02-29T12:30', '2024-02-29T24:15', '2024-02-29T23:60', '2024-02-29T00:10Z'],
    f_3: [null, '31.04.2026'],
  })) {
    for (const invalid of values) assert.throws(() => save({ ...row.values, [key]: invalid }), CatalogError);
  }
  assert.deepEqual(catalog.searchRecords({ tableId: table.id }).rows, [row]);
});
