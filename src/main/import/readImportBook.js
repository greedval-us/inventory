import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { CatalogError } from '../../shared/catalogError.js';
import { formatCellValue } from '../../shared/catalogFields.js';
import { excelValue, importCell, isEmpty } from './excelCell.js';

const MAX_ISSUES = 100;
const PREVIEW_ROWS = 5;
const PREVIEW_LENGTH = 180;

function rowValues(row) {
  const values = new Map();
  row.eachCell((cell, column) => {
    try {
      if (cell.type === ExcelJS.ValueType.Merge && !isEmpty(excelValue(cell.master))) {
        throw new CatalogError('Разъедините ячейки и укажите значение каждого поля отдельно.');
      }
      const raw = excelValue(cell);
      if (!isEmpty(raw)) values.set(column, raw);
    } catch (error) {
      if (!(error instanceof CatalogError)) throw error;
      values.set(column, error);
    }
  });
  return values;
}

function previewText(field, value) {
  if (value == null) return '';
  return shortText(formatCellValue(field.type, value));
}

function shortText(text) {
  return text.length > PREVIEW_LENGTH ? text.slice(0, PREVIEW_LENGTH) + '…' : text;
}

function headerText(raw) {
  if (raw == null || raw instanceof CatalogError) return '';
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw.toISOString().replace(/T00:00:00\.000Z$/, '') : '';
  return shortText(String(raw.error ?? raw));
}

function inspectSheet(sheet, hasHeader, fields, date1904) {
  const result = { rows: [], rowCount: 0, issueCount: 0, issues: [], preview: [], sourceHeaders: hasHeader ? fields.map(() => '') : [] };
  const letters = fields.map((_, index) => sheet.getColumn(index + 1).letter);
  let width = 0;
  let extraCell;

  function issue(cell, field, message) {
    result.issueCount++;
    if (result.issues.length < MAX_ISSUES) result.issues.push({ cell, field, message });
    result.rows.length = 0;
  }

  sheet.eachRow(row => {
    const values = rowValues(row);
    if (!values.size) return;
    for (const column of values.keys()) {
      width = Math.max(width, column);
      if (column > fields.length && !extraCell) extraCell = row.findCell(column).address;
    }
    if (hasHeader && row.number === 1) {
      result.sourceHeaders = fields.map((_, index) => headerText(values.get(index + 1)));
      return;
    }
    result.rowCount++;
    const record = {};
    const before = result.issueCount;
    for (const [index, field] of fields.entries()) {
      const column = index + 1;
      const raw = values.get(column);
      try {
        if (raw instanceof CatalogError) throw raw;
        record[field.key] = importCell(field, raw, row.findCell(column), date1904);
      } catch (error) {
        if (!(error instanceof CatalogError)) throw error;
        issue(letters[index] + row.number, field.label, error.message);
      }
    }
    if (before === result.issueCount && result.preview.length < PREVIEW_ROWS) {
      result.preview.push(fields.map(field => previewText(field, record[field.key])));
    }
    if (!result.issueCount) result.rows.push(record);
  });
  if (!width) {
    issue('A1', '', 'Лист пуст. Выберите лист с данными.');
  } else if (width !== fields.length) {
    // Keep the structural error visible even when many row-level errors have already been reported.
    const cell = extraCell ?? letters[width] + '1';
    const field = extraCell ? '' : fields[width].label;
    const message = `Количество столбцов на листе — ${width}, в разделе — ${fields.length}. Проверьте порядок и число столбцов.`;
    result.issueCount++;
    result.issues.unshift({ cell, field, message });
    result.issues.length = Math.min(result.issues.length, MAX_ISSUES);
    result.rows.length = 0;
  } else if (!result.rowCount) {
    issue('A2', '', 'После заголовка нет строк для добавления. Добавьте данные или укажите, что лист без заголовка.');
  }
  return result;
}

export async function readImportBook(filePath) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await readFile(filePath));
  } catch (error) {
    if (['ENOENT', 'EACCES', 'EPERM', 'EBUSY'].includes(error.code)) {
      throw new CatalogError('Файл Excel недоступен. Проверьте путь и права на чтение.');
    }
    throw new CatalogError('Не удалось прочитать книгу. Проверьте, что это исправный файл .xlsx без пароля.');
  }
  if (!workbook.worksheets.length) throw new CatalogError('В книге Excel нет листов с ячейками.');
  return {
    sheetNames: workbook.worksheets.map(sheet => sheet.name),
    inspect(sheetName, hasHeader, fields) {
      const sheet = workbook.worksheets.find(item => item.name === sheetName);
      if (!sheet || typeof hasHeader !== 'boolean') throw new CatalogError('Выберите лист и укажите, есть ли заголовок в первой строке.');
      return inspectSheet(sheet, hasHeader, fields, workbook.properties.date1904);
    },
  };
}
