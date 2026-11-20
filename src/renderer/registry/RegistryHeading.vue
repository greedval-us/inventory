<script setup lang="ts">
import { computed, ref } from 'vue';
import { BookOpen, ChevronRight, Copy, FileInput, FileSpreadsheet, Plus, Settings2 } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useRegistryStore } from '../stores/registryStore';
import type { Collection, TableSchema } from './catalog';
import CollectionEditor from './CollectionEditor.vue';
import CopySectionDialog from './CopySectionDialog.vue';
import ImportExcelDialog from './ImportExcelDialog.vue';
import SectionEditor from './SectionEditor.vue';

const props = defineProps<{ title: string; table?: TableSchema; collection?: Collection }>();
const emit = defineEmits<{ add: []; changed: []; export: []; imported: [added: number] }>();
const store = useRegistryStore();
const router = useRouter();
const dialog = ref<'manage' | 'copy' | 'import' | null>(null);
const parent = computed(() => store.collections.find(item => item.id === props.table?.collectionId));

function saved() {
  dialog.value = null;
  emit('changed');
}
function imported(added: number) {
  dialog.value = null;
  emit('imported', added);
}
async function copied(section: TableSchema) {
  dialog.value = null;
  await store.refreshTables(true);
  await router.push({ name: 'section', params: { id: section.id } });
}
async function deleted() {
  dialog.value = null;
  const destination = parent.value ? { name: 'collection', params: { id: parent.value.id } } : { name: 'home' };
  await router.replace(destination);
}
</script>

<template>
  <header class="registry-heading">
    <div class="registry-title">
      <RouterLink v-if="parent" class="collection-parent" :to="{ name: 'collection', params: { id: parent.id } }">
        <BookOpen :size="13" />{{ parent.name }}<ChevronRight :size="12" />
      </RouterLink>
      <h1>{{ title }}</h1>
    </div>
    <div v-if="store.ready" class="heading-actions">
      <button v-if="store.scopedTables.length" type="button" class="secondary export-button" aria-label="Экспорт в Excel"
        title="Экспорт в Excel" data-action="export-excel" @click="emit('export')">
        <FileSpreadsheet :size="15" aria-hidden="true" /><span>В Excel</span>
      </button>
      <button v-if="table" type="button" class="secondary copy-section-button" aria-label="Копировать структуру"
        title="Копировать структуру" data-action="copy-section" @click="dialog = 'copy'">
        <Copy :size="15" aria-hidden="true" /><span>Копировать структуру</span>
      </button>
      <button v-if="table || collection" type="button" class="secondary manage-button"
        :aria-label="table ? 'Настроить раздел' : 'Настроить коллекцию'"
        :title="table ? 'Настроить раздел' : 'Настроить коллекцию'"
        :data-action="table ? 'manage-section' : 'manage-collection'" @click="dialog = 'manage'">
        <Settings2 :size="15" aria-hidden="true" /><span>Изменить</span>
      </button>
      <button v-if="table" type="button" class="secondary import-button" aria-label="Заполнить из Excel" title="Заполнить из Excel"
        data-action="import-excel" @click="dialog = 'import'">
        <FileInput :size="15" aria-hidden="true" /><span>Заполнить из Excel</span>
      </button>
      <button v-if="store.scopedTables.length" class="primary" type="button" data-action="new-record" @click="emit('add')">
        <Plus :size="16" aria-hidden="true" />Добавить запись
      </button>
    </div>
    <p v-if="table?.description" class="section-description" role="region" aria-label="Описание раздела" tabindex="0">{{ table.description }}</p>
  </header>
  <CopySectionDialog v-if="dialog === 'copy' && table" :source="table" :tables="store.tables" :collections="store.collections"
    @close="dialog = null" @copied="copied" />
  <ImportExcelDialog v-else-if="dialog === 'import' && table" :table="table" @close="dialog = null" @imported="imported" />
  <SectionEditor v-else-if="dialog === 'manage' && table" :table="table" :collections="store.collections"
    @close="dialog = null" @saved="saved" @deleted="deleted" />
  <CollectionEditor v-else-if="dialog === 'manage' && collection" :collection="collection" :tables="store.tables" :collections="store.collections"
    @close="dialog = null" @saved="saved" @deleted="deleted" />
</template>
