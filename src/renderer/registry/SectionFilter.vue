<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronDown, ListFilter } from 'lucide-vue-next';
import { useRegistryStore } from '../stores/registryStore';

const store = useRegistryStore();
const filter = ref<HTMLDetailsElement>();

function dismissOutside(event: Event) {
  if (filter.value?.open && event.target instanceof Node && !filter.value.contains(event.target)) {
    filter.value.open = false;
  }
}
function dismissOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !filter.value?.open) return;
  event.preventDefault();
  filter.value.open = false;
  filter.value.querySelector('summary')?.focus();
}
onMounted(() => {
  document.addEventListener('pointerdown', dismissOutside);
  document.addEventListener('focusin', dismissOutside);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissOutside);
  document.removeEventListener('focusin', dismissOutside);
});
</script>

<template>
  <details ref="filter" class="section-filter" data-action="section-filter" @keydown="dismissOnEscape">
    <summary title="Фильтр разделов">
      <ListFilter :size="16" aria-hidden="true" />Разделы
      <span v-if="store.hiddenSectionIds.length" class="filter-count">{{ store.scopedTables.length - store.hiddenSectionIds.length }}/{{ store.scopedTables.length }}</span>
      <ChevronDown class="filter-chevron" :size="13" aria-hidden="true" />
    </summary>
    <div class="section-filter-body">
      <div class="section-filter-heading">
        <strong>Фильтр разделов</strong>
        <button type="button" class="registry-link-button" data-action="show-all-sections"
          :disabled="!store.hiddenSectionIds.length" @click="store.showAllSections()">Показать все</button>
      </div>
      <div class="section-options">
        <label v-for="table in store.scopedTables" :key="table.id">
          <input type="checkbox" name="visibleSection" :value="table.id" :checked="!store.hiddenSectionIds.includes(table.id)"
            @change="store.setSectionVisible(table.id, ($event.target as HTMLInputElement).checked)" />
          {{ table.name }}
        </label>
      </div>
    </div>
  </details>
</template>
