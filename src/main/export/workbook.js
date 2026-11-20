import ExcelJS from 'exceljs';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { CatalogError } from '../../shared/catalogError.js';
import { formatCellValue } from '../../shared/catalogFields.js';

const MAX_ROWS = 1_048_576;
const MAX_COLUMNS = 16_384;
const MAX_TEXT = 32_767;
const MAX_LINE_FEEDS = 253;
const MAX_SHEET_NAME = 31;
const MAX_DISPLAY_WIDTH = 52;
const unpairedSurrogate = /\p{Surrogate}/gu;
const dateFormats = { date: 'dd.mm.yyyy', datetime: 'dd.mm.yyyy hh:mm', month: 'mm.yyyy' };

function sheetName(name, used) {
  const base = name.replace(unpairedSurrogate, '\ufffd').replace(/[\x00-\x1f\x7f\ufffe\uffff:*?/\\[\]]/g, ' ')
    .replace(/^[\s']+|[\s']+$/g, '') || 'Раздел';
  for (let number = 1; ; number++) {
    const suffix = number === 1 ? '' : ' (' + number + ')';
    // ExcelJS counts UTF-16 units. Cutting in the middle of an emoji would corrupt its name.
    const prefix = base.slice(0, MAX_SHEET_NAME - suffix.length).replace(/[\ud800-\udbff]$/, '').replace(/[\s']+$/, '');
    const candidate = prefix + suffix;
    const key = candidate.normalize('NFC').toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return candidate;
    }
  }
}

function textValue(value, location) {
  if (value.length > MAX_TEXT || (value.match(/\n/g)?.length ?? 0) > MAX_LINE_FEEDS) {
    throw new CatalogError(`${location}: Excel допускает до 32 767 символов и 253 переносов строки в ячейке.`);
  }
  if (value.search(unpairedSurrogate) !== -1) {
    throw new CatalogError(`${location}: текст содержит символы, которые невозможно сохранить в файле Excel.`);
  }
  // Excel uses ST_Xstring escapes for XML-forbidden characters and carriage returns.
  // Escape literal _xHHHH_ prefixes in the same pass, so Excel displays them verbatim.
  return value.replace(/_(?=x[0-9a-fA-F]{4}_)|[\x00-\x08\x0b-\x1f\x7f\ufffe\uffff]/g,
    char => '_x' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + '_');
}

function calendarValue(type, raw, location) {
  const day = type === 'month' ? raw + '-01' : raw;
  const iso = type === 'datetime' ? day + ':00.000Z' : day + 'T00:00:00.000Z';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== iso) {
    throw new CatalogError(`${location}: неверное календарное значение.`);
  }
  // ExcelJS serials agree with Excel starting after its fictitious 29 February 1900.
  return iso < '1900-03-01' ? raw : date;
}

function exportValue(type, raw, location) {
  if (raw == null) return null;
  switch (type) {
    case 'files':
      if (Array.isArray(raw) && raw.every(file => typeof file?.name === 'string')) {
        return raw.length ? textValue(formatCellValue(type, raw), location) : null;
      }
      break;
    case 'text':
    case 'select':
      if (typeof raw === 'string') return textValue(raw, location);
      break;
    case 'checkbox':
      if (typeof raw === 'boolean') return raw;
      break;
    case 'number': {
      if (!Number.isFinite(raw)) break;
      const abs = Math.abs(raw);
      // Store the original decimal spelling as text if Excel's numeric range or precision would lose it.
      if ((abs !== 0 && abs < 2.2250738585072014e-308) || abs > 9.99999999999999e307
        || Number(raw.toPrecision(15)) !== raw) return String(raw);
      return raw;
    }
    case 'date':
    case 'datetime':
    case 'month':
      if (typeof raw === 'string') return calendarValue(type, raw, location);
      break;
  }
  throw new CatalogError(`${location}: значение не соответствует типу поля.`);
}

function addSheet(workbook, { name, fields, rows }, used) {
  if (!fields.length || fields.length > MAX_COLUMNS || rows.length >= MAX_ROWS) {
    throw new CatalogError(`Раздел «${name}»: лист Excel вмещает от 1 до 16 384 столбцов и до 1 048 575 записей с заголовком.`);
  }
  const sheet = workbook.addWorksheet(sheetName(name, used), { views: [{ state: 'frozen', ySplit: 1 }] });
  // Streaming worksheets write the column definitions before the first row.
  const sample = rows.slice(0, 100);
  for (const [column, field] of fields.entries()) {
    const sampleLengths = sample.map(row => {
      const value = row.values[field.key];
      return value == null ? 0 : formatCellValue(field.type, value).length + 2;
    });
    sheet.getColumn(column + 1).width = Math.min(MAX_DISPLAY_WIDTH, Math.max(12, field.label.length + 5, ...sampleLengths));
  }
  const header = sheet.addRow(fields.map(field => textValue(field.label, `Раздел «${name}», название столбца`)));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF315777' } };
  header.commit();

  for (const [index, { values }] of rows.entries()) {
    const row = sheet.getRow(index + 2);
    for (const [column, field] of fields.entries()) {
      const raw = values[field.key];
      if (raw == null) continue;
      const cell = row.getCell(column + 1);
      cell.value = exportValue(field.type, raw, `Раздел «${name}», строка ${row.number}, поле «${field.label}»`);
      if (cell.value instanceof Date) cell.numFmt = dateFormats[field.type];
    }
    // Preserve empty records, including the last record, across a workbook round trip.
    if (!row.hasValues) row.height = sheet.properties.defaultRowHeight;
    row.commit();
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: fields.length } };
  sheet.commit();
}

export async function writeWorkbook(sheets, filePath) {
  if (!sheets.length) throw new CatalogError('Выберите хотя бы один раздел для экспорта.');
  const output = createWriteStream(filePath);
  const outputDone = finished(output);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: true });
  const used = new Set(['history']); // Reserved by Excel, including in mixed case.
  try {
    for (const section of sheets) addSheet(workbook, section, used);
    await Promise.all([outputDone, workbook.commit()]);
  } catch (error) {
    workbook.zip.abort();
    output.destroy();
    await outputDone.catch(() => {});
    throw error;
  }
}
