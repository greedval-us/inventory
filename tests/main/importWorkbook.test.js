import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { writeWorkbook } from '../../src/main/export/workbook.js';
import { readImportBook } from '../../src/main/import/readImportBook.js';
import { CatalogError } from '../../src/shared/catalogError.js';

const field = (key, type, extra = {}) => ({ key, label: key, type, ...extra });

async function pathFor(t) {
  const folder = await mkdtemp(join(tmpdir(), 'inventory-import-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  return join(folder, 'Книга.xlsx');
}

async function bookFor(t, fill) {
  const path = await pathFor(t);
  const book = new ExcelJS.Workbook();
  fill(book.addWorksheet('Данные'), book);
  await book.xlsx.writeFile(path);
  return readImportBook(path);
}

test('импорт собственных выгрузок сохраняет значения и сопоставляет поля по позиции', async t => {
  const source = [field('код', 'text'), field('поле', 'number'), field('день', 'date'),
    field('месяц', 'month'), field('время', 'datetime'), field('тип', 'select'),
    field('флаг', 'checkbox'), field('файл', 'files')];
  const data = { код: '0\u0000245', поле: 1234567890123456, день: '1879-12-31', месяц: '2026-12',
    время: '2024-03-31T02:30', тип: 'Сдано', флаг: false, файл: [] };
  const path = await pathFor(t);
  await writeWorkbook([{ name: 'Накладные', fields: source, rows: [{ values: data }] }], path);
  const book = await readImportBook(path);
  assert.deepEqual(book.sheetNames, ['Накладные']);
  const target = source.map((f, i) => ({ ...f, label: 'Другое имя ' + i, key: 'f_' + i, options: ['Сдано'] }));
  const check = book.inspect('Накладные', true, target);
  assert.equal(check.rowCount, 1);
  assert.equal(check.issueCount, 0, JSON.stringify(check.issues));
  assert.deepEqual(check.rows, [Object.fromEntries(target.map((f, i) => [f.key, data[source[i].key]]))]);
  assert.deepEqual(check.sourceHeaders, source.map(f => f.label));
  assert.deepEqual(check.preview, [['0\u0000245', '1234567890123456', '31.12.1879', '12.2026', '31.03.2024 02:30', 'Сдано', 'Нет', '']]);
  assert.throws(() => book.inspect('Несуществующий', true, target), CatalogError);
});

test('импорт проверяет все непустые строки и места ячеек, учитывает выбор листа и заголовка', async t => {
  const book = await bookFor(t, (sheet, workbook) => {
    sheet.addRow(['код', 'состояние', 'число', 'флажок']);
    sheet.getCell('A2').value = 245;
    sheet.getCell('A2').numFmt = '000000';
    sheet.getCell('B2').value = 'да';
    sheet.getCell('C2').value = { formula: '1-1', result: 0 };
    sheet.getCell('D2').value = { formula: 'FALSE()', result: false };
    sheet.getCell('A4').value = { richText: [{ text: 'Диск ' }, { text: '1' }] };
    sheet.getCell('B4').value = { text: 'НЕТ', hyperlink: 'https://example.com' };
    sheet.getCell('C4').value = '12,5';
    sheet.getCell('D4').value = '1';
    sheet.getCell('X30').font = { bold: true };
    sheet.getCell('Y31').value = '   ';
    workbook.addWorksheet('Пустой лист');
  });
  const fields = [field('код', 'text'), field('статус', 'select', { options: ['Да', 'Нет'] }),
    field('число', 'number', { required: true }), field('да', 'checkbox')];
  assert.deepEqual(book.sheetNames, ['Данные', 'Пустой лист']);
  const valid = book.inspect('Данные', true, fields);
  assert.deepEqual(valid.issues, []);
  assert.deepEqual(valid.rows, [{ код: '000245', статус: 'Да', число: 0, да: false },
    { код: 'Диск 1', статус: 'Нет', число: 12.5, да: true }]);
  const invalid = book.inspect('Данные', false, fields);
  assert.equal(invalid.rowCount, 3);
  assert.deepEqual(invalid.sourceHeaders, []);
  assert.deepEqual(invalid.issues.map(err => err.cell), ['B1', 'C1', 'D1']);
  assert.deepEqual(invalid.rows, []);
  assert.match(book.inspect('Пустой лист', false, fields).issues[0].message, /пуст/i);
});

test('проверка количества столбцов сохраняет позицию пустой ячейки внутри строки', async t => {
  const book = await bookFor(t, sheet => {
    sheet.addRow(['номер', 'примечание', 'вложение']);
    sheet.getCell('A2').value = '123';
    sheet.getCell('C2').value = 'документ.pdf';
    sheet.getCell('C3').value = 'ещё один файл';
  });
  const fields = [field('номер', 'text', { required: true }), field('вес', 'number'), field('файл', 'files')];
  const errors = book.inspect('Данные', true, fields);
  assert.deepEqual(errors.issues.map(e => e.cell), ['C2', 'A3', 'C3']);
  assert.match(errors.issues[0].message, /прикрепите/);
  const tooFew = book.inspect('Данные', true, [...fields, field('лишнее', 'number')]);
  const tooMany = book.inspect('Данные', true, fields.slice(0, 2));
  assert.deepEqual([tooFew.issues[0].cell, tooMany.issues[0].cell], ['D1', 'C1']);
  assert.match(tooFew.issues[0].message, /3.+4/);
  assert.match(tooMany.issues[0].message, /3.+2/);
  assert.deepEqual(tooMany.rows, []);
});

test('вариант списка для числового кода соответствует видимым ведущим нулям Excel', async t => {
  const book = await bookFor(t, sheet => {
    sheet.getCell('A1').value = 42;
    sheet.getCell('A1').numFmt = '0000';
  });
  const report = book.inspect('Данные', false, [field('код', 'select', { options: ['42', '0042'] })]);
  assert.deepEqual(report.rows, [{ код: '0042' }]);
});

test('ошибки Excel, отсутствующие результаты формул и обязательные файлы блокируют весь лист', async t => {
  const book = await bookFor(t, sheet => {
    sheet.addRow(['формула', 'файл', 'количество']);
    sheet.addRow([{ formula: '1+1' }, null, { error: '#DIV/0!' }]);
    for (let i = 0; i < 110; i++) sheet.addRow(['вещь', null, 'ошибка']);
  });
  const result = book.inspect('Данные', true, [field('код', 'text'), field('вложения', 'files', { required: true }), field('количество', 'number')]);
  assert.equal(result.rowCount, 111);
  assert.equal(result.issues.length, 100);
  assert.equal(result.issueCount, 223);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.issues.slice(0, 3).map(err => err.cell), ['A2', 'B2', 'C2']);
  assert.match(result.issues[0].message, /формулы/);
  assert.match(result.issues[1].message, /вложения/);
  assert.match(result.issues[2].message, /#DIV\/0!/);
});

test('даты Excel учитывают начало календаря книги и точность поля', async t => {
  const historic = await bookFor(t, sheet => {
    for (const [i, serial] of [1, 59, 60, 61].entries()) {
      const cell = sheet.getCell('A' + (i + 1));
      cell.value = serial;
      cell.numFmt = 'dd.mm.yyyy';
    }
  });
  const report = historic.inspect('Данные', false, [field('день', 'date')]);
  assert.deepEqual(report.preview, [['01.01.1900'], ['28.02.1900'], ['01.03.1900']]);
  assert.deepEqual(report.issues.map(item => item.cell), ['A3']);
  const modern = await bookFor(t, (sheet, book) => {
    book.properties.date1904 = true;
    sheet.addRow([0, new Date('2026-11-30T14:00:03Z')]);
    sheet.getCell('A1').numFmt = 'dd.mm.yyyy';
    sheet.getCell('B1').numFmt = 'dd.mm.yyyy hh:mm:ss';
  });
  const check = modern.inspect('Данные', false, [field('день', 'date'), field('время', 'datetime')]);
  assert.deepEqual(check.issues.map(error => error.cell), ['B1']);
});

test('повреждённый или недоступный файл сообщает ошибку чтения', async t => {
  const path = await pathFor(t);
  await assert.rejects(readImportBook(path), /недоступен/);
  await writeFile(path, 'not an xlsx file');
  await assert.rejects(readImportBook(path), /\.xlsx/);
});
