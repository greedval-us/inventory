import { computed, ref, shallowRef, type Ref } from 'vue';
import { DEFAULT_PAGE_SIZE, lastPageOffset } from '../../shared/registryPaging.js';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { errorMessage, type ColumnSort, type RecordGroup, type RegistryRow } from '../registry/catalog';

const SEARCH_DELAY_MS = 180;

export function useRegistryRecords(tableId: Ref<number | null>, collectionId: Ref<number | null>,
  sorts: Ref<Record<number, ColumnSort>>, ready: Ref<boolean>) {
  const rows = shallowRef<RegistryRow[]>([]);
  const groups = shallowRef<RecordGroup[]>([]);
  const total = ref(0);
  const pageSize = ref(DEFAULT_PAGE_SIZE);
  const offsets = shallowRef<Record<number, number>>({});
  const offset = computed(() => tableId.value === null ? 0 : offsets.value[tableId.value] ?? 0);
  const field = ref('');
  const query = ref('');
  const error = ref('');
  const loading = ref(true);
  let revision = 0;
  let timer: ReturnType<typeof setTimeout>;

  function setOffset(id: number, value: number) {
    offsets.value = { ...offsets.value, [id]: value };
  }

  async function loadRows({ keepResults = false } = {}) {
    const current = ++revision;
    clearTimeout(timer);
    if (!keepResults) loading.value = true;
    error.value = '';
    try {
      const filter = { field: field.value || null, query: query.value, limit: pageSize.value };
      const id = tableId.value;
      if (id === null) {
        const result: RecordGroup[] = await getDesktopApi().searchRecordGroups({
          ...filter, collectionId: collectionId.value, offsets: offsets.value, sorts: sorts.value,
        });
        if (current !== revision) return;
        groups.value = result;
        offsets.value = Object.fromEntries(result.map(group => [group.tableId, group.offset]));
      } else {
        const page = await getDesktopApi().searchRecords({
          ...filter, tableId: id, offset: offset.value, sort: sorts.value[id] ?? null,
        });
        if (current !== revision) return;
        total.value = page.total;
        if (offset.value && offset.value >= page.total) {
          setOffset(id, lastPageOffset(page.total, pageSize.value));
          await loadRows();
          return;
        }
        rows.value = page.rows;
      }
    } catch (cause) {
      if (current === revision) error.value = errorMessage(cause, 'Не удалось прочитать записи.');
    } finally {
      if (current === revision) loading.value = false;
    }
  }

  function beginSearch(value: string) {
    revision++;
    clearTimeout(timer);
    loading.value = true;
    query.value = value;
    offsets.value = {};
  }

  function selectField(value: string) {
    field.value = value;
    offsets.value = {};
    return loadRows();
  }

  function search(value: string) {
    beginSearch(value);
    if (ready.value) timer = setTimeout(loadRows, SEARCH_DELAY_MS);
  }

  function resetSearch() {
    query.value = '';
    return selectField('');
  }

  function goToPage(id: number, direction: -1 | 1) {
    setOffset(id, Math.max(0, (offsets.value[id] ?? 0) + direction * pageSize.value));
    return loadRows({ keepResults: true });
  }

  function setPageSize(size: number) {
    if (size === pageSize.value) return;
    const smallerPage = Math.min(size, pageSize.value);
    const needsReload = tableId.value == null
      ? groups.value.some(group => group.total > smallerPage)
      : total.value > smallerPage;
    pageSize.value = size;
    if (!needsReload || !ready.value) return;
    offsets.value = Object.fromEntries(Object.entries(offsets.value).map(([id, start]) => [id, start - start % size]));
    return loadRows({ keepResults: true });
  }

  return { rows, groups, total, offset, pageSize, field, query, error, loading, loadRows,
    beginSearch, setOffset, selectField, search, resetSearch, goToPage, setPageSize };
}
