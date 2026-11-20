import { CatalogError } from '../../shared/catalogError.js';
import { FIELD_TYPE_LABELS, normalizeLabel } from '../../shared/catalogFields.js';

export function positiveId(id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new CatalogError('Некорректный идентификатор.');
  return id;
}

export function label(value, description) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new CatalogError(`Укажите ${description}.`);
  }
  return value.trim();
}

function uniqueLabels(values, description) {
  const seen = new Set();
  return Array.from(values, value => {
    const name = label(value, description);
    const key = normalizeLabel(name);
    if (seen.has(key)) throw new CatalogError(`Повторяется ${description} «${name}».`);
    seen.add(key);
    return name;
  });
}

function optionChanges(previous, options, sources) {
  const remaining = new Set(previous);
  const changes = new Map();
  if (sources !== undefined && (!Array.isArray(sources) || sources.length !== options.length)) {
    throw new CatalogError('Не удалось сопоставить варианты списка. Откройте настройки раздела заново.');
  }
  for (const [index, name] of options.entries()) {
    const old = sources === undefined ? (remaining.has(name) ? name : null) : sources[index];
    if (old === null) continue;
    if (!remaining.delete(old)) throw new CatalogError('Неизвестный или повторяющийся исходный вариант списка.');
    if (old !== name) changes.set(old, name);
  }
  for (const deleted of remaining) changes.set(deleted, null);
  return changes;
}

export function defineFields(definitions, previousFields = null, lastFieldId = 0) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new CatalogError('Добавьте хотя бы один столбец.');
  }
  // SQLite allows 2000 columns by default. The first column stores the record ID.
  if (definitions.length > 1999) throw new CatalogError('SQLite поддерживает до 1999 пользовательских столбцов в разделе.');
  const labels = uniqueLabels(definitions.map(field => field?.label), 'название столбца');
  const existing = new Map(previousFields?.map(field => [field.key, field]));
  const changedOptions = new Map();
  const fields = definitions.map((inputField, index) => {
    const type = inputField.type;
    if (typeof type !== 'string' || !Object.hasOwn(FIELD_TYPE_LABELS, type)) {
      throw new CatalogError(`Выберите тип столбца «${labels[index]}».`);
    }
    let previous;
    if (previousFields !== null && inputField.key !== undefined) {
      previous = existing.get(inputField.key);
      if (!existing.delete(inputField.key)) throw new CatalogError('Неизвестный или повторяющийся столбец. Откройте настройки раздела заново.');
    }
    const field = { key: previous?.key ?? `f_${++lastFieldId}`, label: labels[index], type };
    if (inputField.required !== undefined && typeof inputField.required !== 'boolean') {
      throw new CatalogError('Укажите признак обязательного поля.');
    }
    if (inputField.required) field.required = true;
    if (inputField.hint !== undefined) {
      if (typeof inputField.hint !== 'string' || inputField.hint.includes('\0')) throw new CatalogError('Укажите текст подсказки.');
      const hint = inputField.hint.trim();
      if (hint) field.hint = hint;
    }
    if (type === 'select') {
      const collecting = previous !== undefined && previous.type !== 'select';
      const options = collecting && inputField.options === undefined ? [] : inputField.options;
      if (!Array.isArray(options) || (!collecting && options.length === 0)) {
        throw new CatalogError(`Укажите варианты для столбца «${field.label}».`);
      }
      field.options = uniqueLabels(options, 'значение списка');
      const changes = optionChanges(previous?.options ?? [], field.options, inputField.optionSources);
      if (changes.size) changedOptions.set(field.key, changes);
    }
    return field;
  });
  return { fields, lastFieldId, changedOptions };
}
