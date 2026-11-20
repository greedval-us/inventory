import { ref, shallowRef, type Ref } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { errorMessage, type TableSchema } from '../registry/catalog';

type TableWidths = Record<string, number>;
type ColumnWidths = Record<number, TableWidths>;

export function useColumnWidths(tables: Ref<TableSchema[]>) {
  const columnWidths = shallowRef<ColumnWidths>({});
  const widthError = ref<{ tableId: number; message: string } | null>(null);
  const pending = new Map<string, Promise<number | undefined>>();
  let initialLoad: Promise<void> | undefined;

  function loadWidths(): Promise<void> {
    return initialLoad ??= Promise.resolve()
      .then(() => getDesktopApi().listColumnWidths())
      .then((saved: ColumnWidths) => { columnWidths.value = saved; })
      .catch(cause => { initialLoad = undefined; throw cause; });
  }

  function update(tableId: number, fieldKey: string, width: number | undefined) {
    const fields = { ...columnWidths.value[tableId] };
    if (width === undefined) delete fields[fieldKey];
    else fields[fieldKey] = width;
    columnWidths.value = { ...columnWidths.value, [tableId]: fields };
  }

  function pruneWidths() {
    const kept: ColumnWidths = {};
    for (const table of tables.value) {
      const saved = columnWidths.value[table.id];
      if (!saved) continue;
      const fields = Object.fromEntries(table.fields.filter(f => saved[f.key] !== undefined).map(f => [f.key, saved[f.key]]));
      if (Object.keys(fields).length) kept[table.id] = fields;
    }
    columnWidths.value = kept;
  }

  async function resizeColumn(tableId: number, fieldKey: string, width: number) {
    const current = columnWidths.value[tableId]?.[fieldKey];
    if (current === width) return;
    const key = tableId + '/' + fieldKey;
    const previous = pending.get(key) ?? Promise.resolve(current);
    if (widthError.value?.tableId === tableId) widthError.value = null;
    update(tableId, fieldKey, width);

    // Send each release immediately. If the last write fails, restore the last successful width.
    const write = Promise.resolve().then(() => getDesktopApi().setColumnWidth({ tableId, fieldKey, width }))
      .then(() => null, cause => errorMessage(cause, 'Не удалось сохранить ширину столбца.'));
    const done: Promise<number | undefined> = Promise.all([previous, write]).then(([priorWidth, failure]) => {
      const saved = failure ? priorWidth : width;
      if (pending.get(key) === done) {
        pending.delete(key);
        if (failure && tables.value.some(t => t.id === tableId && t.fields.some(f => f.key === fieldKey))) {
          update(tableId, fieldKey, saved);
          widthError.value = { tableId, message: failure };
        }
      }
      return saved;
    });
    pending.set(key, done);
    await done;
  }

  return { columnWidths, widthError, loadWidths, pruneWidths, resizeColumn };
}
