import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DEFAULT_PAGE_SIZE, GROUP_SCROLL_PAGE_SIZE } from '../../shared/registryPaging.js';
import type { useRegistryStore } from '../stores/registryStore';

function measureTable(card: HTMLElement, total: number) {
  const grid = card.querySelector<HTMLElement>('.grid-scroll')!;
  const body = grid.querySelector('tbody')!;
  const chrome = card.offsetHeight - grid.offsetHeight - (card.querySelector<HTMLElement>('.grid-footer')?.offsetHeight ?? 0);
  const headings = grid.querySelector('thead')!.offsetHeight;
  const scrollbar = grid.offsetHeight - grid.clientHeight;
  return {
    total,
    fixedHeight: chrome + headings + scrollbar,
    rowHeight: Math.ceil(body.getBoundingClientRect().height / Math.max(1, body.rows.length)),
    pagerHeight: card.querySelector<HTMLElement>('.grid-footer')?.offsetHeight ?? 32,
  };
}

function rowsThatFit(area: HTMLElement, totals: number[]) {
  const cards = Array.from(area.querySelectorAll<HTMLElement>('.registry-card'));
  if (!cards.length || cards.length !== totals.length) return;
  const tables = cards.map((card, index) => measureTable(card, totals[index]));
  const notice = area.querySelector<HTMLElement>('.hidden-matches')?.offsetHeight ?? 0;
  const available = area.clientHeight - 8 - notice - (tables.length - 1) * 12;
  for (let limit = DEFAULT_PAGE_SIZE; limit >= 1; limit--) {
    const required = tables.reduce((height, table) => {
      const rows = Math.max(1, Math.min(table.total, limit));
      return height + table.fixedHeight + rows * table.rowHeight + (table.total > limit ? table.pagerHeight : 0);
    }, 0);
    if (required <= available) return limit;
  }
  // When even one row per section exceeds the viewport, keep several records together while scrolling.
  return tables.length > 1 ? GROUP_SCROLL_PAGE_SIZE : 1;
}

export function useRegistryPageSize(store: ReturnType<typeof useRegistryStore>) {
  const area = ref<HTMLElement>();
  const viewport = ref('');
  const groups = computed(() => store.tableId == null
    ? store.visibleSections.map(group => [group.table.id, group.total])
    : [[store.tableId, store.total]]);
  let observer: ResizeObserver;
  let lastLayout = '';
  let checkExpandedRows = false;
  let measuredTables: typeof store.tables | undefined;
  let measuredWidths: typeof store.columnWidths | undefined;
  onMounted(() => {
    observer = new ResizeObserver(([entry]) => {
      const size = entry.borderBoxSize[0];
      viewport.value = size.inlineSize + '/' + size.blockSize;
    });
    if (area.value) observer.observe(area.value);
  });
  onBeforeUnmount(() => observer?.disconnect());
  watch([viewport, groups, () => store.tables, () => store.columnWidths, () => store.loading, () => store.ready, () => store.hiddenMatchCount], () => {
    if (!area.value || !viewport.value || !store.ready || store.loading || store.error) return;
    // Keep page boundaries stable while browsing. Re-measure when the results or window change.
    const layout = JSON.stringify([viewport.value, store.tableId, groups.value, store.query, store.field, store.hiddenMatchCount]);
    const sameLayout = layout === lastLayout && measuredTables === store.tables && measuredWidths === store.columnWidths;
    if (sameLayout) {
      if (!checkExpandedRows) return;
      checkExpandedRows = false;
      if (store.visibleSections.some(section => section.offset !== 0)) return;
    }
    const size = rowsThatFit(area.value, groups.value.map(group => group[1]));
    if (size !== undefined) {
      measuredTables = store.tables;
      measuredWidths = store.columnWidths;
      lastLayout = layout;
      // Rows added to the first page can wrap differently. Check the expanded page once.
      const next = sameLayout ? Math.min(size, store.pageSize) : size;
      checkExpandedRows = store.tableId == null && next > store.pageSize
        && store.visibleSections.some(section => section.total > store.pageSize);
      store.setPageSize(next);
    }
  }, { flush: 'post' });
  return area;
}
