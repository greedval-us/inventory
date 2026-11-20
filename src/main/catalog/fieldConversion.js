import { CatalogError } from '../../shared/catalogError.js';
import { formatCellValue, normalizeLabel } from '../../shared/catalogFields.js';
import { cellValue } from './cellValues.js';
import { rowsForUpdate, storedRows } from './storedRows.js';

function conversionError(field, raw, id) {
  const value = String(raw).replaceAll('\0', '␀');
  return new CatalogError(`В записи №${id} значение «${value}» поля «${field.label}» нельзя преобразовать в выбранный тип.`);
}

function addOption(options, name) {
  const key = normalizeLabel(name);
  if (!options.has(key)) options.set(key, name);
  return options.get(key);
}

function storedOption(source, target, raw, id, options) {
  if (raw === null) return null;
  const name = formatCellValue(source.type, raw).trim();
  if (!name) return null;
  if (name.includes('\0')) throw conversionError(target, raw, id);
  return addOption(options, name);
}

export function previewStoredOptions(db, name, field) {
  const choices = new Map();
  for (const row of storedRows(db, name, [field])) storedOption(field, field, row[field.key], row.id, choices);
  const options = [];
  for (const choice of choices.values()) {
    options.push(choice);
    if (options.length === 8) break;
  }
  return { options, total: choices.size };
}

// Express a decimal as significant digits and a power of ten, ignoring purely textual formatting.
function decimalIdentity(value) {
  const [mantissa, exponent = '0'] = String(value).trim().toLowerCase().replace(',', '.').split('e');
  const [whole, fraction = ''] = mantissa.replace(/^[+-]/, '').split('.');
  const digits = (whole + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  const significant = digits.replace(/0+$/, '');
  const power = Number(exponent) - fraction.length + digits.length - significant.length;
  return (mantissa.startsWith('-') ? '-' : '') + significant + 'e' + power;
}

function temporalInput(from, to, raw) {
  if (from === 'month') {
    if (to === 'date') return raw + '-01';
    if (to === 'datetime') return raw + '-01T00:00';
  }
  if (from === 'date' && to === 'datetime') return raw + 'T00:00';
  if (from === 'datetime' && to === 'date' && raw.endsWith('T00:00')) return raw.slice(0, 10);
  if (to === 'month' && ((from === 'date' && raw.endsWith('-01')) || (from === 'datetime' && raw.endsWith('-01T00:00')))) {
    return raw.slice(0, 7);
  }
  return raw;
}

function convertedValue({ source, target, options }, raw, id) {
  if (raw === null || (typeof raw === 'string' && !raw.trim())) return null;
  if (target.type === 'select') return storedOption(source, target, raw, id, options);
  if (target.type === 'text') return formatCellValue(source.type, raw);
  const input = temporalInput(source.type, target.type, raw);
  let result;
  try {
    result = cellValue(target, input);
  } catch (error) {
    if (error instanceof CatalogError) throw conversionError(target, raw, id);
    throw error;
  }
  if (target.type === 'number' && typeof input === 'string') {
    const decimal = decimalIdentity(input);
    // A large rounded integer can print as the input decimal while actually storing a different integer.
    const largeInteger = Number.isInteger(result) && !Number.isSafeInteger(result);
    if (decimal !== decimalIdentity(result) || (largeInteger && decimal !== decimalIdentity(BigInt(result)))) {
      throw conversionError(target, raw, id);
    }
  }
  return typeof result === 'boolean' ? Number(result) : result;
}

export function copyConvertedRows(db, from, to, previous, retainedFields) {
  const retained = retainedFields.map(target => {
    const source = previous.get(target.key);
    const changed = source.type !== target.type;
    return { source, target, changed, options: changed && target.type === 'select' ? new Map() : null };
  });
  const keys = retained.map(({ target }) => target.key);
  const insert = db.prepare(`INSERT INTO ${to}(id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})`);
  for (const row of rowsForUpdate(db, from, retained.map(column => column.source))) {
    const values = retained.map(column => {
      const raw = row[column.target.key];
      return column.changed ? convertedValue(column, raw, row.id) : raw;
    });
    insert.run(row.id, ...values);
  }
  for (const { target, options } of retained) {
    if (!options) continue;
    for (const manual of target.options) addOption(options, manual);
    if (!options.size) throw new CatalogError(`Добавьте хотя бы один вариант списка для пустого поля «${target.label}».`);
    target.options = Array.from(options.values());
  }
}
