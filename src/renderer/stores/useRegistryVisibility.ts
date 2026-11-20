import { computed, shallowRef, type Ref } from 'vue';
import type { Collection, TableSchema } from '../registry/catalog';

export function useRegistryVisibility(scopedTables: Readonly<Ref<TableSchema[]>>, collections: Ref<Collection[]>) {
  const selectedCollectionIds = shallowRef<(number | null)[]>([]);
  const hiddenSectionIds = shallowRef<number[]>([]);
  const collectionFilterOptions = computed(() => [...collections.value, { id: null, name: 'Без коллекции' }]);
  const collectionFilteredTables = computed(() => {
    if (!selectedCollectionIds.value.length) return scopedTables.value;
    const selected = new Set(selectedCollectionIds.value);
    return scopedTables.value.filter(table => selected.has(table.collectionId));
  });
  // Visibility is independent of the search term and the current page of results.
  const shownTablesById = computed(() => {
    const hidden = new Set(hiddenSectionIds.value);
    return new Map(collectionFilteredTables.value.filter(table => !hidden.has(table.id)).map(table => [table.id, table]));
  });

  function toggleCollectionFilter(id: number | null) {
    const selected = selectedCollectionIds.value;
    selectedCollectionIds.value = selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id];
  }

  function clearCollectionFilter() {
    selectedCollectionIds.value = [];
  }

  function setSectionVisible(id: number, visible: boolean) {
    if (visible) hiddenSectionIds.value = hiddenSectionIds.value.filter(item => item !== id);
    else if (!hiddenSectionIds.value.includes(id)) hiddenSectionIds.value = [...hiddenSectionIds.value, id];
  }

  function showSectionsInSelectedCollections() {
    const selectable = new Set(collectionFilteredTables.value.map(table => table.id));
    hiddenSectionIds.value = hiddenSectionIds.value.filter(id => !selectable.has(id));
  }

  function showAllSections() {
    clearCollectionFilter();
    hiddenSectionIds.value = [];
  }

  function pruneVisibility() {
    const collectionIds = new Set(collectionFilterOptions.value.map(option => option.id));
    selectedCollectionIds.value = selectedCollectionIds.value.filter(id => collectionIds.has(id));
    const tableIds = new Set(scopedTables.value.map(table => table.id));
    hiddenSectionIds.value = hiddenSectionIds.value.filter(id => tableIds.has(id));
  }

  return { selectedCollectionIds, collectionFilterOptions, collectionFilteredTables,
    shownTablesById, toggleCollectionFilter, clearCollectionFilter, setSectionVisible,
    showSectionsInSelectedCollections, showAllSections, pruneVisibility };
}
