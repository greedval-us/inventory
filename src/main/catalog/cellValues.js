import { CatalogError } from '../../shared/catalogError.js';
import { formatCellValue, normalizeLabel } from '../../shared/catalogFields.js';

function parseDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    value = value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return null;
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  const iso = parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : value;
  if (!/^\d{4}-\d\d-\d\d$/.test(iso)) return null;
  const date = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

function parseDateTime(value) {
  if (typeof value !== 'string') return null;
  const match = /^(.+)[T ]((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match) return null;
  const day = parseDate(match[1]);
  return day ? day + 'T' + match[2] : null;
}

function parseMonth(value) {
  if (typeof value !== 'string') return null;
  const iso = value.replace(/^(\d{2})\.(\d{4})$/, '$2-$1');
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(iso) ? iso : null;
}

export function cellValue(field, raw) {
  const value = typeof raw === 'string' ? raw.trim() : raw;
  if (value == null || value === '') {
    if (field.required) throw new CatalogError(`Заполните обязательное поле «${field.label}».`);
    return null;
  }
  switch (field.type) {
    case 'text':
      if (['string', 'boolean', 'number'].includes(typeof raw)) return String(raw);
      break;
    case 'date': {
      const date = parseDate(value);
      if (date !== null) return date;
      break;
    }
    case 'datetime': {
      const datetime = parseDateTime(value);
      if (datetime !== null) return datetime;
      break;
    }
    case 'month': {
      const month = parseMonth(value);
      if (month !== null) return month;
      break;
    }
    case 'number': {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(value)) {
        const number = Number(value.replace(',', '.'));
        if (Number.isFinite(number)) return number;
      }
      break;
    }
    case 'checkbox': {
      if (typeof value === 'boolean') return value;
      const token = String(value).toLowerCase();
      if (['1', 'да', 'true'].includes(token)) return true;
      if (['0', 'нет', 'false'].includes(token)) return false;
      break;
    }
    case 'select': {
      const key = normalizeLabel(String(value));
      const option = field.options.find(item => normalizeLabel(item) === key);
      if (option !== undefined) return option;
      break;
    }
  }
  throw new CatalogError(`Недопустимое значение в столбце «${field.label}».`);
}

function searchText(field, value) {
  if (value === null) return '';
  if (field.type === 'number') return String(value) + ' ' + String(value).replace('.', ',');
  const formatted = formatCellValue(field.type, value);
  // Calendar fields are searchable by either the stored ISO value or its displayed form.
  if (typeof value === 'string' && value !== formatted) return normalizeLabel(value + ' ' + formatted);
  return normalizeLabel(formatted);
}

export function recordSearch(fields, values) {
  const search = Object.create(null);
  for (const field of fields) {
    search[normalizeLabel(field.label)] = searchText(field, values[field.key]);
  }
  return JSON.stringify(search);
}
