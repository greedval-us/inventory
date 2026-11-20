<script setup lang="ts">
import { BookOpen, Check } from 'lucide-vue-next';
import { useRegistryStore } from '../stores/registryStore';
import RegistryFilterMenu from './RegistryFilterMenu.vue';

const store = useRegistryStore();
</script>

<template>
  <RegistryFilterMenu label="Коллекции" title="Фильтр коллекций" :count="store.selectedCollectionIds.length"
    data-action="collection-filter">
    <template #icon><BookOpen :size="16" aria-hidden="true" /></template>
    <template #reset>
      <button type="button" class="registry-link-button all-collections" data-action="all-collections"
        :aria-pressed="!store.selectedCollectionIds.length" @click="store.clearCollectionFilter()">
        <Check v-if="!store.selectedCollectionIds.length" :size="14" aria-hidden="true" />Все коллекции
      </button>
    </template>
    <label v-for="option in store.collectionFilterOptions" :key="option.id ?? 'none'">
      <input type="checkbox" name="filterCollection" :value="option.id ?? 'none'" :checked="store.selectedCollectionIds.includes(option.id)"
        @change="store.toggleCollectionFilter(option.id)" />
      <span>{{ option.name }}</span>
    </label>
  </RegistryFilterMenu>
</template>
