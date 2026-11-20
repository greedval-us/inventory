<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { BookOpen, ChevronRight, Folder, FolderOutput, LibraryBig, Plus, Trash2 } from 'lucide-vue-next';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { useRegistryStore } from '../stores/registryStore';
import { errorMessage, type TableSchema } from '../registry/catalog';
import { useSectionDrag } from './useSectionDrag';

const emit = defineEmits<{ navigate: []; createCollection: []; deleteSection: [table: TableSchema] }>();
const registry = useRegistryStore();
const route = useRoute();
const collapsed = ref(new Set<number>());
const { dragged, hovered, start, finish, over, leave, take } = useSectionDrag();
const moving = ref(false);
const moveError = ref('');

const sectionsByCollection = computed(() => {
  const groups = new Map<number | null, TableSchema[]>();
  for (const section of registry.tables) {
    const id = section.collectionId ?? null;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(section);
  }
  return groups;
});
const currentCollection = computed(() => {
  if (route.name === 'collection') return Number(route.params.id);
  if (route.name === 'section') return registry.tables.find(table => table.id === Number(route.params.id))?.collectionId;
  if (route.name === 'new-section' && route.query.collection) return Number(route.query.collection);
  return null;
});
watch([currentCollection, () => route.path], ([id]) => { if (id) collapsed.value.delete(id); });

function toggleCollection(id: number) {
  if (collapsed.value.has(id)) collapsed.value.delete(id);
  else collapsed.value.add(id);
}

async function drop(event: DragEvent, target: number | 'ungroup' | 'delete') {
  const table = take(event, target);
  if (!table || moving.value) return;
  moveError.value = '';
  if (target === 'delete') {
    emit('deleteSection', table);
    return;
  }
  const collectionId = target === 'ungroup' ? null : target;
  moving.value = true;
  try {
    await getDesktopApi().moveTable({ id: table.id, collectionId });
    if (collectionId !== null) collapsed.value.delete(collectionId);
    await registry.refreshAfterStructureChange();
  } catch (cause) {
    moveError.value = errorMessage(cause, 'Не удалось переместить раздел.');
  } finally {
    moving.value = false;
  }
}
</script>

<template>
  <div class="library-navigation" @dragend="finish">
    <div class="library-tree">
      <template v-if="registry.collections.length">
        <h2>Коллекции</h2>
        <div v-for="collection in registry.collections" :key="collection.id" :data-collection-id="collection.id"
          :data-drop-collection="collection.id" class="collection-node"
          :class="{ 'drop-ready': dragged && dragged.collectionId !== collection.id, 'drop-over': hovered === collection.id }"
          @dragover="over($event, collection.id)" @dragleave="leave" @drop="drop($event, collection.id)">
          <div class="collection-heading">
            <RouterLink class="nav-item" :title="collection.name" data-action="open-collection"
              :to="{ name: 'collection', params: { id: collection.id } }" @click="emit('navigate')">
              <BookOpen :size="16" aria-hidden="true" /><span>{{ collection.name }}</span>
            </RouterLink>
            <button v-if="sectionsByCollection.has(collection.id)" type="button" class="disclosure" data-action="toggle-collection"
              :aria-expanded="!collapsed.has(collection.id)" :aria-controls="'nav-collection-' + collection.id"
              :aria-label="(collapsed.has(collection.id) ? 'Развернуть' : 'Свернуть') + ' коллекцию «' + collection.name + '»'"
              @click="toggleCollection(collection.id)">
              <ChevronRight :size="13" aria-hidden="true" />
            </button>
          </div>
          <div v-if="sectionsByCollection.has(collection.id)" v-show="!collapsed.has(collection.id)"
            :id="'nav-collection-' + collection.id" class="collection-sections">
            <RouterLink v-for="table in sectionsByCollection.get(collection.id)" :key="table.id" class="nav-item"
              :title="table.name" :data-drag-section="table.id" :draggable="!moving" @dragstart="start($event, table)"
              :to="{ name: 'section', params: { id: table.id } }" @click="emit('navigate')">
              <Folder :size="14" aria-hidden="true" /><span>{{ table.name }}</span>
            </RouterLink>
          </div>
        </div>
      </template>
      <div v-if="sectionsByCollection.has(null) || !registry.collections.length" class="ungrouped-node"
        :class="{ 'drop-over': hovered === 'ungroup' }"
        @dragover="over($event, 'ungroup')" @dragleave="leave" @drop="drop($event, 'ungroup')">
        <h2>{{ registry.collections.length ? 'Без коллекции' : 'Разделы' }}</h2>
        <RouterLink v-for="table in sectionsByCollection.get(null)" :key="table.id" class="nav-item"
          :title="table.name" :data-drag-section="table.id" :draggable="!moving" @dragstart="start($event, table)"
          :to="{ name: 'section', params: { id: table.id } }" @click="emit('navigate')">
          <Folder :size="16" aria-hidden="true" /><span>{{ table.name }}</span>
        </RouterLink>
      </div>
    </div>
    <div v-if="dragged" class="library-actions drop-actions">
      <div v-if="dragged.collectionId !== null" class="drop-action" data-action="ungroup-dragged-section"
        :class="{ 'drop-over': hovered === 'ungroup' }"
        @dragover="over($event, 'ungroup')" @dragleave="leave" @drop="drop($event, 'ungroup')">
        <FolderOutput :size="15" aria-hidden="true" /><span>Без коллекции</span>
      </div>
      <div class="drop-action delete-drop" data-action="delete-dragged-section"
        :class="{ 'drop-over': hovered === 'delete' }"
        @dragover="over($event, 'delete')" @dragleave="leave" @drop="drop($event, 'delete')">
        <Trash2 :size="15" aria-hidden="true" /><span>Удалить раздел…</span>
      </div>
    </div>
    <div v-else class="library-actions">
      <RouterLink class="nav-item" data-action="new-section"
        :to="{ name: 'new-section', query: currentCollection ? { collection: currentCollection } : {} }" @click="emit('navigate')">
        <Plus :size="16" aria-hidden="true" /><span>Создать раздел</span>
      </RouterLink>
      <button type="button" class="nav-item" data-action="new-collection" @click="emit('createCollection')">
        <LibraryBig :size="16" aria-hidden="true" /><span>Создать коллекцию</span>
      </button>
      <button v-if="registry.schemaError" type="button" class="secondary" @click="registry.refreshTables">Загрузить разделы</button>
    </div>
    <p v-if="moveError" class="move-error" role="alert">{{ moveError }}</p>
  </div>
</template>

<style scoped>
.library-navigation { display: flex; flex-direction: column; min-height: 0; margin-block: 20px 8px; }
.library-tree { display: grid; align-content: start; gap: 1px; min-height: 0; overflow: auto; scrollbar-width: thin; }
h2 { margin: 0 10px 5px; font-size: 0.8214rem; font-weight: 640; color: var(--muted); letter-spacing: .005em; }
.collection-node + .ungrouped-node { margin-top: 12px; }
.collection-node, .ungrouped-node { border-radius: 7px; }
.drop-ready > .collection-heading { outline: 1px dashed var(--line); outline-offset: -1px; border-radius: inherit; }
.drop-over { background: var(--tint); outline: 2px solid var(--accent); outline-offset: -2px; }
.drop-over > .collection-heading { outline: 0; }
.drop-actions { gap: 4px; }
.drop-action { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 5px 9px; border: 1px dashed var(--line); border-radius: 7px; color: var(--accent); font-size: 0.9286rem; }
.delete-drop { color: var(--danger); }
.delete-drop.drop-over { background: color-mix(in srgb, var(--danger) 10%, var(--surface)); outline-color: var(--danger); }
.move-error { margin: 5px 8px; font-size: 0.8571rem; color: var(--danger); overflow-wrap: anywhere; }
.collection-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
.disclosure { display: grid; place-items: center; width: 24px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted); }
.disclosure:hover { background: var(--tint); color: var(--accent); }
.disclosure svg { transition: transform 140ms var(--ease); }
.disclosure[aria-expanded="true"] svg { transform: rotate(90deg); }
.disclosure:focus-visible { outline-offset: -2px; }
.collection-sections { display: grid; margin-inline-start: 17px; padding-inline-start: 2px; border-inline-start: 1px solid var(--line); }
.library-actions { display: grid; flex: none; gap: 1px; padding-top: 3px; }
.library-actions .nav-item { color: var(--accent); }
.library-actions button.nav-item { background: transparent; border: 0; text-align: start; }
@media (max-width: 760px) {
  .library-navigation { margin-block: 8px; }
}
</style>
