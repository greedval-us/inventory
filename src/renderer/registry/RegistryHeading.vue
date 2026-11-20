<script setup lang="ts">
import { computed, ref } from 'vue';
import { BookOpen, ChevronRight, Plus, Settings2 } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useRegistryStore } from '../stores/registryStore';
import type { Collection, TableSchema } from './catalog';
import CollectionEditor from './CollectionEditor.vue';
import SectionEditor from './SectionEditor.vue';

const props = defineProps<{ title: string; table?: TableSchema; collection?: Collection }>();
const emit = defineEmits<{ add: []; changed: [] }>();
const store = useRegistryStore();
const router = useRouter();
const managing = ref(false);
const parent = computed(() => store.collections.find(item => item.id === props.table?.collectionId));

function saved() {
  managing.value = false;
  emit('changed');
}
async function deleted() {
  managing.value = false;
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
      <button v-if="table || collection" type="button" class="secondary manage-button"
        :aria-label="table ? 'Настроить раздел' : 'Настроить коллекцию'"
        :title="table ? 'Настроить раздел' : 'Настроить коллекцию'"
        :data-action="table ? 'manage-section' : 'manage-collection'" @click="managing = true">
        <Settings2 :size="15" aria-hidden="true" /><span>Изменить</span>
      </button>
      <button v-if="store.scopedTables.length" class="primary" type="button" data-action="new-record" @click="emit('add')">
        <Plus :size="16" aria-hidden="true" />Добавить запись
      </button>
    </div>
  </header>
  <SectionEditor v-if="managing && table" :table="table" :collections="store.collections"
    @close="managing = false" @saved="saved" @deleted="deleted" />
  <CollectionEditor v-else-if="managing && collection" :collection="collection" :tables="store.tables" :collections="store.collections"
    @close="managing = false" @saved="saved" @deleted="deleted" />
</template>
