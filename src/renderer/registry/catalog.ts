import { FIELD_TYPE_LABELS, formatCellValue, normalizeLabel } from '../../shared/catalogFields.js';

export type FieldType = keyof typeof FIELD_TYPE_LABELS;
export interface Attachment { id: string; name: string; size: number }
export type Cell = string | number | boolean | Attachment[] | null;
export type Values = Record<string, Cell>;
export interface TableField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  fileKind?: string;
  required?: boolean;
  hint?: string;
}
export interface Collection { id: number; name: string }
export interface TableSchema {
  id: number;
  name: string;
  description: string;
  collectionId: number | null;
  fields: TableField[];
}
export interface RegistryRow { id: number; tableId: number; values: Values }
export interface RecordGroup { tableId: number; rows: RegistryRow[]; total: number; offset: number }
export interface ColumnSort { key: string; direction: 'asc' | 'desc' }
export interface ExcelImportBook {
  token: string;
  fileName: string;
  sheetNames: string[];
  fields: Pick<TableField, 'key' | 'label'>[];
}
export interface ExcelImportReport {
  revision: string;
  rowCount: number;
  issueCount: number;
  issues: { cell: string; field: string; message: string }[];
  preview: string[][];
  sourceHeaders: string[];
}

export function registryFieldLabels(tables: TableSchema[]): string[] {
  const labels = new Map<string, string>();
  for (const table of tables) {
    for (const field of table.fields) {
      const key = normalizeLabel(field.label);
      if (!labels.has(key)) labels.set(key, field.label);
    }
  }
  return Array.from(labels.values());
}

export function displayCell(type: FieldType, value: Cell | undefined) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return '—';
  return formatCellValue(type, value);
}

export function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : '';
  return message || fallback;
}
