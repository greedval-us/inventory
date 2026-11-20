<script setup lang="ts">
import { computed, ref } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import CatalogEditorDialog from './CatalogEditorDialog.vue';
import type { Collection, TableSchema } from './catalog';

const props = defineProps<{ collection?: Collection | null; tables: TableSchema[]; collections: Collection[] }>();
const emit = defineEmits<{ close: []; saved: [collection: Collection]; deleted: [] }>();
const name = ref(props.collection?.name ?? '');
const selected = ref<number[]>(props.collection
  ? props.tables.filter(table => table.collectionId === props.collection?.id).map(table => table.id)
  : []);
const collectionNames = computed(() => new Map(props.collections.map(collection => [collection.id, collection.name])));
async function save(): Promise<Collection> {
  const data = { name: name.value.trim(), tableIds: [...selected.value] };
  return getDesktopApi().saveCollection(props.collection ? { ...data, id: props.collection.id } : data);
}
async function remove() {
  if (props.collection) await getDesktopApi().deleteCollection({ id: props.collection.id });
}
</script>

<template>
  <CatalogEditorDialog kind="collection" :title="collection ? 'Настройки коллекции' : 'Новая коллекция'"
    :valid="Boolean(name.trim())" :save="save" :save-label="collection ? 'Сохранить' : 'Создать'"
    :remove="collection ? remove : undefined" delete-label="Удалить коллекцию"
    :delete-message="'После удаления коллекции «' + collection?.name + '» её разделы и записи будут доступны в общем реестре без коллекции.'"
    @close="emit('close')" @saved="emit('saved', $event)" @deleted="emit('deleted')">
    <label class="control">
      Название коллекции
      <input v-model="name" name="collectionName" required autofocus />
    </label>
    <fieldset v-if="tables.length" class="membership">
      <legend>Разделы в коллекции</legend>
      <div class="membership-list">
        <label v-for="table in tables" :key="table.id" class="check-control membership-row">
          <input v-model="selected" type="checkbox" name="tableIds" :value="table.id" />
          <span>{{ table.name }}</span>
          <small v-if="table.collectionId != null && table.collectionId !== collection?.id">
            Из коллекции «{{ collectionNames.get(table.collectionId) }}»
          </small>
        </label>
      </div>
    </fieldset>
  </CatalogEditorDialog>
</template>

<style scoped>
.membership legend { padding: 0; margin-bottom: 6px; font-size: 0.9286rem; font-weight: 550; }
.membership-list { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.membership-row { padding: 7px 10px; cursor: pointer; }
.membership-row + .membership-row { border-top: 1px solid var(--line); }
.membership-row:hover, .membership-row:focus-within { background: var(--canvas); }
.membership-row input { flex: none; }
.membership-row small { margin-inline-start: auto; max-width: 45%; color: var(--muted); text-align: end; }
</style>
