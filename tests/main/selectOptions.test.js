import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../../src/main/database/Database.js';
import { createCatalog } from '../../src/main/catalog/createCatalog.js';
import { CatalogError } from '../../src/shared/catalogError.js';

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  const catalog = createCatalog(db);
  const table = catalog.createTable({ name: 'Оборудование', fields: [
    { label: 'Статус', type: 'select', options: ['Резерв', 'Выдан', 'Списан', 'Склад', 'Еще'] },
    { label: 'Номер', type: 'number' },
  ] });
  return { db, catalog, table };
}

test('обновляет выбранные варианты и поиск при обмене названиями, удалении и добавлении', t => {
  const { catalog, table } = fixture(t);
  const [status, number] = table.fields;
  const oldValues = [...status.options, null];
  const ids = oldValues.map((value, i) => catalog.saveRecord({ tableId: table.id, values: { f_1: value, f_2: i } }).id);
  const options = ['Выдан', 'Резерв', 'Склад', 'ЕЩЁ', 'На проверке'];
  const changed = catalog.updateTable({ id: table.id, expectedFields: table.fields, fields: [number, {
    ...status, options, optionSources: ['Резерв', 'Выдан', null, 'Еще', null], required: true, hint: '  Выберите состояние  ',
  }] });
  assert.deepEqual(changed.fields, [number, { ...status, options, required: true, hint: 'Выберите состояние' }]);
  const newValues = ['Выдан', 'Резерв', null, null, 'ЕЩЁ', null];
  const rows = catalog.searchRecords({ tableId: table.id }).rows;
  assert.deepEqual(rows.map(r => [r.id, r.values.f_1, r.values.f_2]),
    newValues.map((value, i) => [ids[i], value, i]).reverse());
  assert.equal(catalog.searchRecords({ field: 'Статус', query: 'выдан' }).rows[0].id, ids[0]);
  assert.equal(catalog.searchRecords({ query: 'Ещё' }).rows[0].id, ids[4]);
  for (const query of ['списан', 'Склад', 'проверке', 'еще']) assert.equal(catalog.searchRecords({ query }).total, 0);
  assert.throws(() => catalog.updateTable({ id: table.id, expectedFields: table.fields, fields: table.fields }), CatalogError);
  const newRecord = catalog.saveRecord({ tableId: table.id, values: { f_1: 'на проверке', f_2: 42 } });
  assert.equal(newRecord.values.f_1, 'На проверке');
  const renamed = catalog.updateTable({ id: table.id, fields: [
    number, { ...changed.fields[1], options: ['Резерв', 'Ещё', 'Склад', 'На проверке'], required: false, hint: '' },
  ] });
  assert.equal('required' in renamed.fields[1], false);
  assert.equal('hint' in renamed.fields[1], false);
  assert.equal(catalog.searchRecords({ field: 'Статус', query: 'резерв' }).rows[0].id, ids[1]);
  assert.equal(catalog.searchRecords({ field: 'Статус', query: 'Ещё' }).total, 0);
});

test('при неверном сопоставлении или сбое индекса откатывает варианты и значения записей', t => {
  const { catalog, db, table } = fixture(t);
  const [status, number] = table.fields;
  const record = catalog.saveRecord({ tableId: table.id, values: { f_1: 'Склад' } });
  for (const input of [
    { options: ['А', 'Б'], optionSources: ['Склад', 'Склад'] },
    { options: ['А'], optionSources: ['Устаревший вариант'] },
    { options: ['А'], optionSources: [] },
    { options: ['А', ' а '] },
    { options: [], optionSources: [] },
    { required: 'да' }, { hint: 14 },
  ]) assert.throws(() => catalog.updateTable({ id: table.id, fields: [{ ...status, ...input }, number] }), CatalogError);
  db.open().exec("CREATE TRIGGER fail_options BEFORE UPDATE OF search_values ON catalog_records BEGIN SELECT RAISE(ABORT, 'fail_options'); END");
  assert.throws(() => catalog.updateTable({ id: table.id, fields: [
    { ...status, options: ['Ремонт'], optionSources: ['Склад'] }, number,
  ] }), /fail_options/);
  assert.deepEqual(catalog.listTables(), [table]);
  assert.deepEqual(catalog.searchRecords({ query: 'склад' }).rows, [record]);
  assert.equal(catalog.searchRecords({ query: 'ремонт' }).total, 0);
});
