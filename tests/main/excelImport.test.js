import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { createApplicationServices } from '../../src/main/createApplicationServices.js';
import { createExcelImport } from '../../src/main/windows/excelImport.js';

async function fixture(t) {
  const folder = await mkdtemp(join(tmpdir(), 'inventory-excel-import-'));
  const services = createApplicationServices({ userData: folder, name: 'Inventory', version: 'test' });
  t.after(async () => { services.close(); await rm(folder, { recursive: true, force: true }); });
  const table = services.catalog.createTable({ name: 'Диски', fields: [{ label: 'Номер', type: 'number', required: true }] });
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Верно').addRows([['Число'], [245], [260]]);
  workbook.addWorksheet('Ошибка').addRows([['Число'], [15], ['не число']]);
  const file = join(folder, 'Книга.xlsx');
  await workbook.xlsx.writeFile(file);
  const window = { isDestroyed: () => false };
  const dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: [file] }) };
  const importer = createExcelImport({ services, getWindow: () => window, dialog });
  return { importer, services, tableId: table.id, folder, dialog };
}

test('импорт применяет только последний успешный отчёт по выбранной книге и только один раз', async t => {
  const { importer, services, tableId, dialog } = await fixture(t);
  const { token, fileName, fields } = await importer.open({ tableId });
  assert.equal(fileName, 'Книга.xlsx');
  assert.deepEqual(fields, [{ key: 'f_1', label: 'Номер' }]);
  const check = sheetName => importer.check({ token, sheetName, hasHeader: true });
  const apply = revision => importer.apply({ token, revision });
  const previous = check('Верно');
  const invalid = check('Ошибка');
  assert.equal(invalid.issues[0].cell, 'A3');
  assert.throws(() => apply(previous.revision), /Проверьте/);
  assert.throws(() => apply(invalid.revision), /Проверьте/);
  assert.equal(services.catalog.searchRecords({ tableId }).total, 0);
  const { revision } = check('Верно');
  dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  assert.equal(await importer.open({ tableId }), null);
  assert.deepEqual(apply(revision), { added: 2 });
  assert.throws(() => apply(revision), /заново/);
  assert.equal(services.catalog.searchRecords({ tableId }).total, 2);
});

test('повторный выбор, закрытие, смена структуры и смена базы исключают применение устаревшей проверки', async t => {
  const { importer, services, tableId, folder } = await fixture(t);
  const first = await importer.open({ tableId });
  const second = await importer.open({ tableId });
  const verify = ({ token }) => importer.check({ token, sheetName: 'Верно', hasHeader: true });
  assert.throws(() => verify(first), /заново/);
  importer.close(first);
  const report = verify(second);
  services.catalog.updateTable({ id: tableId, fields: [{ key: 'f_1', label: 'Ёмкость', type: 'number' }] });
  assert.throws(() => importer.apply({ token: second.token, revision: report.revision }), /измен|заново/i);
  assert.throws(() => verify(second), /измен/i);
  importer.close(second);
  assert.throws(() => verify(second), /заново/);
  const next = await importer.open({ tableId });
  const { revision } = verify(next);
  const original = services.info.databasePath;
  const destination = join(folder, 'другая база');
  await mkdir(destination);
  services.relocateDatabase(destination);
  services.openDatabase(original);
  assert.throws(() => importer.apply({ token: next.token, revision }), /заново/);
  assert.equal(services.catalog.searchRecords({ tableId }).total, 0);
});
