import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { writeWorkbook } from '../../src/main/export/workbook.js';
import { CatalogError } from '../../src/shared/catalogError.js';

async function fileFor(t) {
  const dir = await mkdtemp(join(tmpdir(), 'inventory-xlsx-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'export.xlsx');
}

const field = (key, type = 'text', label = key) => ({ key, type, label });
const section = (name, fields = [field('code', 'text', 'Код')], rows = []) => ({ name, fields, rows });

async function roundTrip(t, sheets) {
  const file = await fileFor(t);
  await writeWorkbook(sheets, file);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  return workbook;
}

test('книга сохраняет типы, порядок, пустые строки и отдельные схемы разделов', async t => {
  const fields = [field('code', 'text', 'Метка'), field('quantity', 'number'), field('state', 'select'), field('flag', 'checkbox'),
    field('date', 'date'), field('time', 'datetime'), field('month', 'month')];
  const literal = '=SUM(1,2) & <текст>';
  const wb = await roundTrip(t, [section('Приборы', fields, [
    { values: { code: '000245', quantity: 17.5, state: ' 01 ', flag: false, date: '2024-02-29',
      time: '2024-03-31T02:30', month: '2024-07' } },
    { values: { code: literal, quantity: 0, flag: true } }, { values: {} },
  ]), section('Документы', [field('name', 'text', 'Название')])]);
  assert.deepEqual(wb.worksheets.map(s => s.name), ['Приборы', 'Документы']);
  const [sheet, empty] = wb.worksheets;
  assert.deepEqual(sheet.getRow(1).values.slice(1), fields.map(f => f.label));
  assert.equal(sheet.getCell('A1').font.bold, true);
  assert.equal(sheet.getColumn(1).width >= 12, true);
  assert.equal(sheet.autoFilter, 'A1:G4');
  assert.equal(sheet.getCell('A2').value, '000245');
  assert.equal(sheet.getCell('B2').value, 17.5);
  assert.equal(sheet.getCell('C2').value, ' 01 ');
  assert.equal(sheet.getCell('D2').value, false);
  assert.equal(sheet.getCell('E2').value.toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(sheet.getCell('F2').value.toISOString(), '2024-03-31T02:30:00.000Z');
  assert.equal(sheet.getCell('G2').value.toISOString(), '2024-07-01T00:00:00.000Z');
  assert.equal(sheet.getCell('G2').numFmt, 'mm.yyyy');
  assert.equal(sheet.getCell('A3').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('A3').value, literal);
  assert.equal(sheet.getCell('B3').value, 0);
  assert.equal(sheet.getCell('C3').value, null);
  assert.equal(sheet.getCell('D3').value, true);
  assert.equal(sheet.rowCount, 4);
  assert.equal(empty.rowCount, 1);
  assert.equal(empty.getCell('A1').value, 'Название');
});

test('названия листов остаются допустимыми и уникальными при замене символов и сокращении', async t => {
  const names = ["'A:?*/\\[B]'", "a:*/?\\[b]", 'History', 'HISTORY', 'Я'.repeat(30) + '😀', 'Я'.repeat(30) + '😀X',
    "Т".repeat(30) + "'конец", "'''"];
  const wb = await roundTrip(t, names.map(name => section(name)));
  const actual = wb.worksheets.map(s => s.name);
  assert.equal(actual.length, names.length);
  assert.equal(new Set(actual.map(name => name.toLowerCase())).size, names.length);
  for (const name of actual) {
    assert.ok(name.length && name.length <= 31 && name.isWellFormed());
    assert.doesNotMatch(name, /[\\:*?/\[\]]|^'|'$|^history$/i);
  }
});

test('экспортирует имена нескольких вложений как текст', async t => {
  const files = [{ id: 'one', name: '=Счёт 245.pdf', size: 7 }, { id: 'two', name: 'Снимок.jpg', size: 0 }];
  const book = await roundTrip(t, [section('Осмотр', [field('docs', 'files')], [
    { values: { docs: files } }, { values: { docs: [] } },
  ])]);
  const sheet = book.worksheets[0];
  assert.equal(sheet.getCell('A2').value, '=Счёт 245.pdf, Снимок.jpg');
  assert.equal(sheet.getCell('A3').value, null);
});

test('длинные числа и даты вне надёжного диапазона Excel сохраняются исходным текстом', async t => {
  const rows = [{ values: { n: 1234567890123456, day: '1879-12-31' } }, { values: { n: Number.MIN_VALUE, day: '1900-02-28' } }];
  const wb = await roundTrip(t, [section('История', [field('n', 'number'), field('day', 'date')], rows)]);
  rows.forEach(({ values }, i) => {
    assert.deepEqual(wb.worksheets[0].getRow(i + 2).values.slice(1), [String(values.n), values.day]);
  });
});

test('исходный текст проходит через XML без потери управляющих символов и буквальных _xHHHH_', async t => {
  const texts = ['до\0после', '\tа\r\nб\rв\n', '_x000D_', '_x005F_x0041_', '_x000a_', '&amp;'];
  const wb = await roundTrip(t, [section('Коды', [field('v')], texts.map(v => ({ values: { v } })))]);
  assert.deepEqual(texts.map((_, i) => wb.worksheets[0].getCell('A' + (i + 2)).value), texts);
});

test('сообщает о превышении ограничений XLSX и несовместимых символах', async t => {
  const path = await fileFor(t);
  const invalid = [
    [section('Без полей', [])], [section('Полей слишком много', new Array(16_385))],
    [section('Записей слишком много', [field('code')], new Array(1_048_576))],
    ...['а'.repeat(32_768), 'a\n'.repeat(254), '\ud800'].map(code =>
      [section('Данные', [field('code')], [{ values: { code } }])]),
    [],
  ];
  for (const input of invalid) await assert.rejects(writeWorkbook(input, path), CatalogError);
});
