<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-vue-next';
import { nextColumnSort } from '../stores/useTableSorts';
import type { ColumnSort, TableField } from './catalog';
import ColumnResizeHandle from './ColumnResizeHandle.vue';

const props = defineProps<{ field: TableField; sort?: ColumnSort; width?: number }>();
const emit = defineEmits<{ change: []; preview: [width: number]; resize: [width: number]; cancel: [] }>();
const direction = computed(() => props.sort?.key === props.field.key ? props.sort.direction : undefined);
const indicators = {
  asc: { icon: ArrowUp, aria: 'ascending' },
  desc: { icon: ArrowDown, aria: 'descending' },
} as const;
const indicator = computed(() => direction.value ? indicators[direction.value] : null);
const action = computed(() => {
  const next = nextColumnSort(props.field.key, props.sort);
  if (!next) return 'Вернуть исходный порядок строк (сначала новые записи)';
  return next.direction === 'asc' ? 'Сортировать по возрастанию' : 'Сортировать по убыванию';
});
</script>

<template>
  <th :data-kind="field.type" scope="col" :aria-sort="indicator?.aria">
    <button type="button" :data-sort-key="field.key" class="column-sort"
      :title="action" :aria-label="field.label + '. ' + action" @click="emit('change')">
      <span>{{ field.label }}</span><component :is="indicator?.icon ?? ChevronsUpDown" :size="13" aria-hidden="true" />
    </button>
    <ColumnResizeHandle :field-key="field.key" :label="field.label" :width="width"
      @preview="emit('preview', $event)" @commit="emit('resize', $event)" @cancel="emit('cancel')" />
  </th>
</template>

<style scoped>
.column-sort {
  display: inline-flex; align-items: center; justify-content: flex-start; width: 100%; gap: .35em;
  padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: inherit;
  cursor: pointer;
}
.column-sort span { min-width: 0; overflow-wrap: anywhere; }
.column-sort svg { flex: none; opacity: .6; }
[data-kind="number"] .column-sort { justify-content: flex-end; }
[aria-sort] .column-sort, .column-sort:hover { color: var(--accent); }
[aria-sort] .column-sort svg { opacity: 1; }
</style>
