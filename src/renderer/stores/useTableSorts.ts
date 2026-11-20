import { ref, shallowRef, type Ref } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { errorMessage, type ColumnSort, type TableSchema } from '../registry/catalog';

type Sorts = Record<number, ColumnSort>;
type PendingSort = { sort: ColumnSort | null; done: Promise<boolean> };

export function nextColumnSort(key: string, current?: ColumnSort | null): ColumnSort | null {
  if (current?.key !== key) return { key, direction: 'asc' };
  return current.direction === 'asc' ? { key, direction: 'desc' } : null;
}

export function useTableSorts(tables: Ref<TableSchema[]>) {
  const sorts = shallowRef<Sorts>({});
  const sortError = ref<{ tableId: number; message: string } | null>(null);
  const pending = new Map<number, PendingSort>();
  let initialLoad: Promise<void> | undefined;

  function loadSorts(): Promise<void> {
    return initialLoad ??= Promise.resolve()
      .then(() => getDesktopApi().listTableSorts())
      .then((saved: Sorts) => { sorts.value = saved; })
      .catch(cause => { initialLoad = undefined; throw cause; });
  }

  function hasField(id: number, key: string) {
    return tables.value.find(table => table.id === id)?.fields.some(field => field.key === key);
  }

  function pruneSorts() {
    sorts.value = Object.fromEntries(Object.entries(sorts.value).filter(([id, sort]) => hasField(Number(id), sort.key)));
  }

  function cycleSort(tableId: number, key: string) {
    const previous = pending.get(tableId);
    const sort = nextColumnSort(key, previous ? previous.sort : sorts.value[tableId]);
    if (sortError.value?.tableId === tableId) sortError.value = null;

    // Dispatch every click immediately. Apply acknowledgements in click order even if several are pending.
    const write = getDesktopApi().setTableSort({ tableId, sort }).then(
      () => null,
      (cause: unknown) => errorMessage(cause, 'Не удалось сохранить сортировку. Повторите нажатие.'),
    );
    const done: Promise<boolean> = Promise.all([previous?.done, write]).then(([, failure]) => {
      if (!failure) {
        const saved = { ...sorts.value };
        if (sort && hasField(tableId, sort.key)) saved[tableId] = sort;
        else delete saved[tableId];
        sorts.value = saved;
      }
      if (pending.get(tableId)?.done !== done) return false;
      pending.delete(tableId);
      if (failure) sortError.value = { tableId, message: failure };
      return true;
    });
    pending.set(tableId, { sort, done });
    return done;
  }

  return { sorts, sortError, loadSorts, pruneSorts, cycleSort };
}
