import ExcelJS from 'exceljs';
import { CatalogError } from '../../shared/catalogError.js';
import { cellValue } from '../catalog/cellValues.js';

const examples = {
  number: 'Введите число, например 12,5.',
  date: 'Введите дату, например 31.12.2026.',
  datetime: 'Введите дату и время с точностью до минуты, например 31.12.2026 14:30.',
  month: 'Введите месяц и год, например 12.2026.',
  checkbox: 'Используйте Да/Нет, 1/0 или TRUE/FALSE.',
};

// Use the cached result directly. ExcelJS cell.value omits a formula result of 0 or false.
export function excelValue(cell) {
  if (!cell) return null;
  if (cell.type === ExcelJS.ValueType.Merge) return null; // only the top-left cell owns a value
  if (cell.type === ExcelJS.ValueType.Formula) {
    if (cell.result == null) throw new CatalogError('У формулы нет сохранённого результата. Пересчитайте и сохраните книгу в Excel.');
    return cell.result;
  }
  const value = cell.value;
  if (value?.richText) return value.richText.map(run => run.text).join('');
  if (value?.hyperlink) return value.text;
  return value;
}

export function isEmpty(value) {
  return value == null || (typeof value === 'string' && !value.trim());
}

function calendarInput(field, date, date1904) {
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new CatalogError('Некорректная дата Excel.');
  // ExcelJS uses a continuous calendar. Excel's 1900 system inserts a fictitious leap day at serial 60.
  if (!date1904 && time < Date.UTC(1900, 2, 1)) {
    if (time >= Date.UTC(1900, 1, 28)) throw new CatalogError('29 февраля 1900 года не существует. Исправьте дату в книге.');
    date = new Date(time + 86_400_000);
  }
  const iso = date.toISOString();
  const midnight = iso.endsWith('T00:00:00.000Z');
  switch (field.type) {
    case 'date':
      if (!midnight) throw new CatalogError('Укажите дату без времени или выберите для поля тип «Дата и время».');
      return iso.slice(0, 10);
    case 'datetime':
      if (!iso.endsWith(':00.000Z')) throw new CatalogError(examples.datetime);
      return iso.slice(0, 16);
    case 'month':
      if (!midnight || date.getUTCDate() !== 1) {
        throw new CatalogError('Для месяца укажите первое число без времени или текст в формате ММ.ГГГГ.');
      }
      return iso.slice(0, 7);
    case 'text':
      return midnight ? iso.slice(0, 10) : iso.slice(0, -1);
    default:
      throw new CatalogError('В ячейке дата Excel. Укажите значение, соответствующее типу поля.');
  }
}

export function importCell(field, value, cell, date1904) {
  if (value?.error) throw new CatalogError(`В ячейке ошибка Excel ${value.error}. Исправьте значение в книге.`);
  if (field.type === 'files') {
    if (!isEmpty(value)) throw new CatalogError('Оставьте ячейку пустой и прикрепите файлы в карточке записи.');
    if (field.required) throw new CatalogError('Для обязательного файлового поля нужны вложения. Добавьте запись вручную.');
    return [];
  }
  if (value instanceof Date) value = calendarInput(field, value, date1904);
  // Identifiers and list options can both use the displayed leading zeros of an Excel code.
  if ((field.type === 'text' || field.type === 'select') && Number.isSafeInteger(value) && value >= 0 && /^0+$/.test(cell?.numFmt)) {
    value = String(value).padStart(cell.numFmt.length, '0');
  }
  try {
    return cellValue(field, value);
  } catch (error) {
    if (!(error instanceof CatalogError) || isEmpty(value)) throw error;
    if (field.type === 'select') {
      const options = field.options.slice(0, 6).map(option => '«' + option + '»').join(', ');
      const more = field.options.length > 6 ? '…' : '.';
      throw new CatalogError('Допустимые значения — ' + options + more);
    }
    throw new CatalogError(examples[field.type] ?? error.message);
  }
}
