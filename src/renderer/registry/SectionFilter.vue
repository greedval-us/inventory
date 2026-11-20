<script setup lang="ts">
import { computed } from 'vue';
import { ListFilter } from 'lucide-vue-next';
import { useRegistryStore } from '../stores/registryStore';
import RegistryFilterMenu from './RegistryFilterMenu.vue';

const store = useRegistryStore();
const count = computed(() => {
  const total = store.collectionFilteredTables.length;
  const visible = store.shownTablesById.size;
  return visible < total ? visible + '/' + total : '';
});
</script>

<template>
  <RegistryFilterMenu label="Разделы" title="Фильтр разделов" :count="count" data-action="section-filter">
    <template #icon><ListFilter :size="16" aria-hidden="true" /></template>
    <template #reset>
      <button type="button" class="registry-link-button" data-action="show-all-sections"
        :disabled="!count" @click="store.showSectionsInSelectedCollections()">Показать все</button>
    </template>
    <label v-for="table in store.collectionFilteredTables" :key="table.id">
      <input type="checkbox" name="visibleSection" :value="table.id" :checked="store.shownTablesById.has(table.id)"
        @change="store.setSectionVisible(table.id, ($event.target as HTMLInputElement).checked)" />
      <span>{{ table.name }}</span>
    </label>
    <p v-if="!store.collectionFilteredTables.length" class="filter-empty">В выбранных коллекциях пока нет разделов.</p>
  </RegistryFilterMenu>
</template>
