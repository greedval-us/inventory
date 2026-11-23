import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { normalizeLabel } from '../../shared/catalogFields.js';
import { DEFAULT_PAGE_SIZE, GROUP_SCROLL_PAGE_SIZE } from '../../shared/registryPaging.js';
import { errorMessage, registryFieldLabels } from '../registry/catalog';
import { useCatalogSchema } from './useCatalogSchema';
import { useColumnWidths } from './useColumnWidths';
import { useRegistryRecords } from './useRegistryRecords';
import { useRegistryVisibility } from './useRegistryVisibility';
import { useTableSorts } from './useTableSorts';

export const useRegistryStore = defineStore('registry', () => {
  const { tables, collections, schemaError, refreshTables } = useCatalogSchema();
  const { sorts, sortError, loadSorts, pruneSorts, cycleSort } = useTableSorts(tables);
  const { columnWidths, widthError, loadWidths, pruneWidths, resizeColumn } = useColumnWidths(tables);
  const tableId = ref<number | null>(null);
  const collectionId = ref<number | null>(null);
  const ready = ref(false);
  const { beginSearch, setOffset, groups, ...records } = useRegistryRecords(tableId, collectionId, sorts, ready);
  const { field, query, loading, error, loadRows } = records;
  const scopedTables = computed(() => collectionId.value == null ? tables.value
    : tables.value.filter(table => table.collectionId === collectionId.value));
  const { pruneVisibility, ...visibility } = useRegistryVisibility(scopedTables, collections);
  const fieldLabels = computed(() => registryFieldLabels(
    tableId.value == null ? scopedTables.value : tables.value.filter(table => table.id === tableId.value),
  ));
  const filtered = computed(() => Boolean(query.value.trim() || field.value));
  const hiddenMatchCount = computed(() => {
    if (tableId.value != null || !filtered.value || loading.value || error.value) return 0;
    return groups.value.reduce((count, group) => visibility.shownTablesById.value.has(group.tableId) ? count : count + group.total, 0);
  });
  const visibleSections = computed(() => {
    return groups.value.flatMap(group => {
      const table = visibility.shownTablesById.value.get(group.tableId);
      if (!table || (filtered.value && !group.total)) return [];
      return [{ table, rows: group.rows, offset: group.offset, total: group.total }];
    });
  });
  let opening = 0;

  async function refreshAfterStructureChange(deletedTableId?: number) {
    const currentId = tableId.value;
    const previousFilter = field.value;
    const originalField = tables.value.find(table => table.id === currentId)?.fields.find(f => f.label === previousFilter);
    await refreshTables(true);
    if (schemaError.value) {
      ready.value = false;
      error.value = schemaError.value;
      return;
    }
    pruneSorts();
    pruneWidths();
    if (!ready.value || tableId.value === deletedTableId) return;
    pruneVisibility();
    if (field.value) {
      const renamed = currentId === tableId.value && field.value === previousFilter && originalField
        ? tables.value.find(table => table.id === currentId)?.fields.find(f => f.key === originalField.key)
        : undefined;
      field.value = renamed?.label ?? fieldLabels.value.find(label => normalizeLabel(label) === normalizeLabel(field.value)) ?? '';
    }
    await loadRows();
  }

  async function openRegistry(scope: { tableId: number | null; collectionId: number | null; query: string }) {
    const current = ++opening;
    ready.value = false;
    error.value = '';
    field.value = '';
    beginSearch(scope.query);
    visibility.showAllSections();
    try {
      await Promise.all([refreshTables(), loadSorts(), loadWidths()]);
    } catch (cause) {
      if (current === opening) {
        error.value = errorMessage(cause, 'Не удалось загрузить настройки таблиц.');
        loading.value = false;
      }
      return;
    }
    if (current !== opening) return;
    const missingTable = scope.tableId != null && !tables.value.some(t => t.id === scope.tableId);
    const missingCollection = scope.collectionId != null && !collections.value.some(c => c.id === scope.collectionId);
    if (schemaError.value || missingTable || missingCollection) {
      error.value = schemaError.value || (missingCollection ? 'Коллекция не найдена.' : 'Раздел не найден.');
      loading.value = false;
      return;
    }
    tableId.value = scope.tableId;
    collectionId.value = scope.collectionId;
    pruneSorts();
    if (current === 1 && scope.tableId === null && !filtered.value && scopedTables.value.length > 1) {
      // Share the first page across sections until the view measures how many rows fit.
      records.setPageSize(Math.max(GROUP_SCROLL_PAGE_SIZE, Math.ceil(DEFAULT_PAGE_SIZE / scopedTables.value.length)));
    }
    ready.value = true;
    await loadRows();
  }

  async function sortBy(id: number, key: string) {
    if (!await cycleSort(id, key) || !ready.value) return;
    if (!scopedTables.value.some(table => table.id === id) || (tableId.value !== null && tableId.value !== id)) return;
    setOffset(id, 0);
    await loadRows({ keepResults: true });
  }

  return {
    ...records, tables, collections, collectionId, tableId, ready, schemaError, refreshTables,
    ...visibility, scopedTables, fieldLabels, visibleSections, hiddenMatchCount,
    refreshAfterStructureChange, openRegistry, sorts, sortError, sortBy, columnWidths, widthError, resizeColumn,
  };
});
