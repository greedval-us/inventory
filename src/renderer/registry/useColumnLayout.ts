import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { MIN_COLUMN_WIDTH } from '../../shared/columnWidths.js';
import type { TableSchema } from './catalog';

interface NaturalLayout { fields: Record<string, number>; actions: number; viewport: number }

export function useColumnLayout(section: () => TableSchema, saved: () => Record<string, number> | undefined) {
  const table = ref<HTMLTableElement>();
  const natural = shallowRef<NaturalLayout>();
  const draft = ref<{ key: string; width: number } | null>(null);
  const customized = computed(() => section().fields.some(field => saved()?.[field.key] !== undefined));
  let observer: ResizeObserver;

  // Measure the browser's original column layout; hold the other columns steady during the drag.
  function measure() {
    const el = table.value;
    const header = el?.tHead?.rows[0];
    if (!el || !header || !el.parentElement) return;
    el.classList.add('measure-columns');
    try {
      const fields = Object.fromEntries(section().fields.map(({ key }, index) =>
        [key, header.cells[index].getBoundingClientRect().width]));
      natural.value = { fields, actions: header.cells[header.cells.length - 1].getBoundingClientRect().width,
        viewport: el.parentElement.clientWidth };
    } finally {
      el.classList.remove('measure-columns');
    }
  }

  function preview(key: string, width: number) {
    if (!customized.value && !draft.value) measure();
    draft.value = { key, width };
  }

  const layout = computed(() => {
    const base = natural.value;
    if (!base || (!draft.value && !customized.value)) return null;
    const fields = section().fields;
    const chosen = (key: string) => draft.value?.key === key ? draft.value.width : saved()?.[key];
    const widths = fields.map(({ key }) => chosen(key) ?? base.fields[key]);
    if (widths.some(width => width === undefined)) return null;
    let total = widths.reduce((sum, width) => sum + width, base.actions);
    // A trailing automatic column fills the available space. Explicit widths stay exact,
    // including in a section containing just one user-defined field.
    const last = widths.length - 1;
    if (chosen(fields[last].key) === undefined) {
      const extra = Math.max(MIN_COLUMN_WIDTH - widths[last], base.viewport - total);
      widths[last] += extra;
      total += extra;
    }
    return { widths, actions: base.actions, total };
  });

  watch([() => section().fields, customized], () => {
    if (customized.value) measure();
  }, { flush: 'post' });
  watch(() => section().id, () => { natural.value = undefined; draft.value = null; });
  onMounted(() => {
    if (customized.value) measure();
    observer = new ResizeObserver(() => {
      if (customized.value && table.value?.parentElement?.clientWidth !== natural.value?.viewport) measure();
    });
    if (table.value?.parentElement) observer.observe(table.value.parentElement);
  });
  onBeforeUnmount(() => observer?.disconnect());

  return { table, layout, preview, cancel: () => { draft.value = null; } };
}
