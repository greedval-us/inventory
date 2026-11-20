import { normalizeLabel } from '../../shared/catalogFields.js';
import type { FieldType, TableField } from './catalog';

export interface OptionDraft { id: number; source: string | null; label: string }

export interface FieldDraft {
  id: number;
  source?: TableField;
  label: string;
  type: FieldType;
  fileKind: string;
  required: boolean;
  hint: string;
  options: string;
  choices: OptionDraft[];
}

export function fieldDraft(id: number, source?: TableField): FieldDraft {
  return {
    id, source, label: source?.label ?? '', type: source?.type ?? 'text',
    fileKind: source?.fileKind ?? 'any',
    required: source?.required ?? false, hint: source?.hint ?? '', options: '',
    choices: (source?.options ?? []).map((label, index) => ({ id: index, label, source: label })),
  };
}

export function matchesStoredField(draft: FieldDraft, stored: TableField) {
  if (draft.source?.key !== stored.key || draft.type !== stored.type || draft.label.trim() !== stored.label ||
      draft.required !== Boolean(stored.required) || draft.hint.trim() !== (stored.hint ?? '')) return false;
  if (draft.type === 'files' && draft.fileKind !== (stored.fileKind ?? 'any')) return false;
  if (!stored.options) return true;
  return draft.choices.length === stored.options.length && draft.choices.every((choice, index) =>
    choice.source === stored.options![index] && choice.label.trim() === choice.source);
}

export function fieldDefinitions(drafts: FieldDraft[]) {
  if (!drafts.length) throw new Error('Добавьте хотя бы одно поле.');
  const labels = new Set<string>();
  return drafts.map(field => {
    const label = field.label.trim();
    if (!label) throw new Error('Задайте название каждому полю.');
    const normalized = normalizeLabel(label);
    if (labels.has(normalized)) throw new Error('Повторяется название поля «' + label + '».');
    labels.add(normalized);

    const identity = field.source ? { key: field.source.key } : {};
    const hint = field.hint.trim();
    const definition = { ...identity, label, type: field.type,
      ...(field.required ? { required: true } : {}), ...(hint ? { hint } : {}) };
    if (field.type === 'files') return { ...definition, fileKind: field.fileKind };
    if (field.type !== 'select') return definition;
    const editingOptions = field.source?.type === 'select';
    const collectingOptions = field.source && !editingOptions;
    const options = editingOptions
      ? field.choices.map(option => option.label.trim())
      : field.options.split(/\r?\n/).map(option => option.trim()).filter(Boolean);
    if ((!collectingOptions && !options.length) || options.includes('')) {
      throw new Error('Заполните варианты списка «' + label + '».');
    }
    if (new Set(options.map(normalizeLabel)).size !== options.length) {
      throw new Error('Названия вариантов в поле «' + label + '» должны различаться.');
    }
    return { ...definition, options, ...(editingOptions ? { optionSources: field.choices.map(choice => choice.source) } : {}) };
  });
}
