<script setup lang="ts">
import { Folder, FolderClosed, SearchX, SlidersHorizontal } from 'lucide-vue-next';
import { useRegistryStore } from '../stores/registryStore';
import type { RegistryRow } from './catalog';
import RecordGrid from './RecordGrid.vue';

const store = useRegistryStore();
const emit = defineEmits<{ edit: [row: RegistryRow]; remove: [row: RegistryRow] }>();
const plurals = new Intl.PluralRules('ru');
function recordCount(total: number) {
  const form = plurals.select(total);
  return total + ' ' + (form === 'one' ? 'запись' : form === 'few' ? 'записи' : 'записей');
}
</script>

<template>
  <div v-if="store.hiddenMatchCount" class="hidden-matches" role="status">
    <SlidersHorizontal :size="15" aria-hidden="true" /><span>Найдено записей в скрытых разделах — {{ store.hiddenMatchCount }}.</span>
    <button type="button" class="registry-link-button" @click="store.showAllSections()">Показать все разделы</button>
  </div>
  <div v-if="store.visibleSections.length" class="section-results">
    <section v-for="group in store.visibleSections" :key="group.table.id" :data-section-id="group.table.id" class="registry-card"
      :aria-labelledby="'section-title-' + group.table.id">
      <header class="group-heading">
        <span class="group-icon" aria-hidden="true"><Folder :size="16" /></span>
        <h2 :id="'section-title-' + group.table.id">
          <RouterLink :to="{ name: 'section', params: { id: group.table.id } }">{{ group.table.name }}</RouterLink>
        </h2>
        <span class="group-count">{{ recordCount(group.total) }}</span>
      </header>
      <RecordGrid :table="group.table" :rows="group.rows" :total="group.total" :offset="group.offset" :page-size="store.pageSize"
        @edit="emit('edit', $event)" @remove="emit('remove', $event)" />
    </section>
  </div>
  <div v-else-if="!store.hiddenMatchCount" class="registry-empty">
    <template v-if="!store.collectionFilteredTables.length && store.selectedCollectionIds.length">
      <FolderClosed class="empty-symbol" :size="26" aria-hidden="true" /><h2>В выбранных коллекциях нет разделов</h2>
      <button type="button" class="secondary" @click="store.clearCollectionFilter()">Показать все коллекции</button>
    </template>
    <template v-else-if="!store.shownTablesById.size">
      <FolderClosed class="empty-symbol" :size="26" aria-hidden="true" /><h2>Все разделы скрыты</h2>
      <button type="button" class="secondary" @click="store.showAllSections()">Показать все разделы</button>
    </template>
    <template v-else>
      <SearchX class="empty-symbol" :size="26" aria-hidden="true" /><h2>Совпадений нет</h2>
      <p>Измените запрос или выберите другое поле.</p>
    </template>
  </div>
</template>
