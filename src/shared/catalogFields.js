export const FIELD_TYPE_LABELS = Object.freeze({
  text: 'Текст', number: 'Число', date: 'Дата', datetime: 'Дата и время', month: 'Месяц и год',
  select: 'Выпадающий список', checkbox: 'Флажок', files: 'Файлы',
});

export function normalizeLabel(value) {
  return value.trim().normalize('NFC').toLocaleLowerCase('ru-RU');
}

export function formatTemporalValue(type, value) {
  if (typeof value !== 'string') return value;
  if (type === 'month') return value.split('-').reverse().join('.');
  if (type !== 'date' && type !== 'datetime') return value;
  const [date, time] = value.split('T');
  const day = date.split('-').reverse().join('.');
  return time ? day + ' ' + time : day;
}

export function formatCellValue(type, value) {
  if (type === 'files') return (value ?? []).map(file => file.name).join(', ');
  if (type === 'checkbox' || typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(formatTemporalValue(type, value));
}
