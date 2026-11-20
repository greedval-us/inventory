<script setup lang="ts">
import { ChevronDown, FolderSearch, Search } from 'lucide-vue-next';
import { useRegistryStore } from '../stores/registryStore';
import SectionFilter from './SectionFilter.vue';

const props = defineProps<{ scope: 'home' | 'collection' | 'section' }>();
const emit = defineEmits<{ query: [value: string] }>();
const store = useRegistryStore();
const labels = { home: 'Поиск по всем разделам', collection: 'Поиск в коллекции', section: 'Поиск в разделе' };
</script>

<template>
  <div class="registry-filters" role="search" aria-label="Поиск записей">
    <label class="registry-search">
      <Search :size="16" aria-hidden="true" />
      <input type="search" name="query" :aria-label="labels[props.scope]" :placeholder="labels[props.scope]"
        :value="store.query" @input="emit('query', ($event.target as HTMLInputElement).value)" />
    </label>
    <div class="registry-field">
      <select name="field" aria-label="Поле поиска" :value="store.field" @change="store.selectField(($event.target as HTMLSelectElement).value)">
        <option value="">Все поля</option>
        <option v-for="label in store.fieldLabels" :key="label" :value="label">{{ label }}</option>
      </select>
      <ChevronDown :size="13" aria-hidden="true" />
    </div>
    <div class="registry-scope-filters">
      <SectionFilter v-if="scope !== 'section'" />
      <RouterLink v-if="scope !== 'home'" class="global-search-link" data-action="search-all-sections" title="Искать во всех разделах"
        aria-label="Искать во всех разделах" :to="{ name: 'home', query: store.query ? { q: store.query } : {} }">
        <FolderSearch :size="15" aria-hidden="true" /><span v-if="scope === 'section'">Во всех разделах</span>
      </RouterLink>
    </div>
  </div>
</template>
