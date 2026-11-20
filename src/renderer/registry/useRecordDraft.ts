import { computed, onBeforeUnmount, ref } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { errorMessage, type Attachment, type RegistryRow, type TableSchema, type Values } from './catalog';

interface EditorProps { tables: TableSchema[]; initialTable: number | null; record: RegistryRow | null }

export function useRecordDraft(props: EditorProps, onSaved: (tableId: number) => Promise<void>) {
  const selected = ref(props.record?.tableId ?? props.initialTable ?? (props.tables.length === 1 ? props.tables[0].id : null));
  const table = computed(() => props.tables.find(item => item.id === selected.value));
  const recordId = props.record?.id ?? null;
  function emptyValues(): Values {
    return Object.fromEntries((table.value?.fields ?? []).map(field => [
      field.key, field.type === 'files' ? [] : field.type === 'checkbox' && !field.required ? false : null,
    ]));
  }
  const values = ref<Values>(props.record ? { ...props.record.values } : emptyValues());
  const busy = ref(false);
  const error = ref('');
  const activity = ref('');
  const staged = new Set<string>();
  let mounted = true;

  async function discard(ids = [...staged]) {
    if (!ids.length) return;
    await getDesktopApi().discardAttachments({ ids });
    for (const id of ids) staged.delete(id);
  }
  function cleanup() {
    // The storage service also recovers abandoned drafts when it next opens.
    void discard().catch(cause => console.warn('Inventory attachment cleanup', cause));
  }
  onBeforeUnmount(() => {
    mounted = false;
    if (!busy.value) cleanup();
  });
  async function run(action: () => Promise<void>, fallback: string, status = '') {
    if (busy.value || !mounted) return;
    busy.value = true;
    error.value = '';
    activity.value = status;
    try {
      await action();
    } catch (cause) {
      if (mounted) error.value = errorMessage(cause, fallback);
    } finally {
      busy.value = false;
      activity.value = '';
      if (!mounted) cleanup();
    }
  }
  function changeTable() {
    values.value = emptyValues();
    return run(() => discard(), 'Не удалось сбросить временные вложения.');
  }
  function files(key: string) {
    const value = values.value[key];
    return Array.isArray(value) ? value : [];
  }
  function pick(fieldKey: string) {
    const tableId = selected.value;
    return run(async () => {
      const added: Attachment[] = await getDesktopApi().pickAttachments({ tableId, recordId, fieldKey });
      if (!added.length) return;
      const ids = added.map(file => file.id);
      for (const id of ids) staged.add(id);
      if (mounted && selected.value === tableId) values.value[fieldKey] = [...files(fieldKey), ...added];
      else await discard(ids);
    }, 'Не удалось прикрепить файлы.', 'Добавление файлов…');
  }
  function remove(fieldKey: string, id: string) {
    return run(async () => {
      if (staged.has(id)) await discard([id]);
      values.value[fieldKey] = files(fieldKey).filter(file => file.id !== id);
    }, 'Не удалось убрать вложение.');
  }
  function download(fieldKey: string, id: string) {
    return run(async () => {
      await getDesktopApi().saveAttachmentAs({ tableId: selected.value, recordId, fieldKey, id });
    }, 'Не удалось скачать вложение.', 'Сохранение файла…');
  }
  function save() {
    const schema = table.value;
    if (!schema) return;
    return run(async () => {
      // Pass plain metadata across the context bridge, outside Vue's reactive proxies.
      const data: Values = {};
      for (const field of schema.fields) {
        const value = values.value[field.key];
        data[field.key] = Array.isArray(value) ? value.map(({ id, name, size }) => ({ id, name, size }))
          : value == null || value === '' ? null : value;
      }
      await getDesktopApi().saveRecord({ tableId: schema.id, ...(recordId != null ? { id: recordId } : {}), values: data });
      for (const value of Object.values(data)) {
        if (Array.isArray(value)) for (const file of value) staged.delete(file.id);
      }
      if (mounted) await onSaved(schema.id);
    }, 'Не удалось сохранить запись.');
  }
  return { selected, table, values, busy, error, activity, changeTable, files, pick, remove, download, save };
}
