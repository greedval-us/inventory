import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExcelExport } from '../../src/main/windows/excelExport.js';

const sheet = { name: 'Акты', fields: [{ key: 'f_1', label: 'Номер', type: 'text' }], rows: [] };

function fixture(showSaveDialog, sheets = [sheet]) {
  const parent = { isDestroyed: () => false };
  const services = { catalog: { exportSheets: () => sheets }, info: { databasePath: null } };
  return { parent, services, run: createExcelExport({ dialog: { showSaveDialog }, getWindow: () => parent, services }) };
}

test('отмена и закрытие окна прерывают экспорт, одновременно открывается один диалог', async () => {
  let answer;
  const { run, parent } = fixture(() => new Promise(resolve => { answer = resolve; }));
  const first = run({});
  await assert.rejects(run({}), /завершения/);
  answer({ canceled: true });
  assert.equal(await first, null);
  const second = run({});
  parent.isDestroyed = () => true;
  answer({ canceled: false, filePath: 'не создавать.xlsx' });
  assert.equal(await second, null);
  await assert.rejects(fixture(() => assert.fail('Не нужно выбирать файл без совпадений'), []).run({}), /нет записей/);
});

test('ошибка выгрузки сохраняет прежний файл, очищает временный и позволяет повторить сохранение', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'inventory-excel-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const filePath = join(folder, 'Акты.xlsx');
  const previous = Buffer.from('предыдущая версия');
  await writeFile(filePath, previous);
  const sheets = [{ ...sheet, rows: [{ values: { f_1: 'a'.repeat(32768) } }] }];
  const { run, services } = fixture(async () => ({ canceled: false, filePath }), sheets);
  await assert.rejects(run({}));
  assert.deepEqual(await readFile(filePath), previous);
  assert.deepEqual(await readdir(folder), ['Акты.xlsx']);
  services.info.databasePath = filePath;
  await assert.rejects(run({}), /база данных/);
  assert.deepEqual(await readFile(filePath), previous);
  services.info.databasePath = null;
  sheets[0] = sheet;
  assert.deepEqual(await run({}), { filePath, sheetCount: 1, rowCount: 0 });
  assert.equal((await readFile(filePath)).subarray(0, 2).toString(), 'PK');
  assert.deepEqual(await readdir(folder), ['Акты.xlsx']);
});
