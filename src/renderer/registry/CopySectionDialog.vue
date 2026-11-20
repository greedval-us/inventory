<script setup lang="ts">
import { ref } from 'vue';
import { normalizeLabel } from '../../shared/catalogFields.js';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import CatalogEditorDialog from './CatalogEditorDialog.vue';
import type { Collection, TableSchema } from './catalog';

const props = defineProps<{ source: TableSchema; tables: TableSchema[]; collections: Collection[] }>();
const emit = defineEmits<{ close: []; copied: [section: TableSchema] }>();
const name = ref(suggestName());
const collectionId = ref(props.source.collectionId);

function suggestName() {
  const names = new Set(props.tables.map(table => normalizeLabel(table.name)));
  let candidate = props.source.name + ' (копия)';
  for (let number = 2; names.has(normalizeLabel(candidate)); number++) {
    candidate = props.source.name + ' (копия ' + number + ')';
  }
  return candidate;
}

function copy(): Promise<TableSchema> {
  return getDesktopApi().copyTableStructure({ sourceId: props.source.id, name: name.value.trim(), collectionId: collectionId.value });
}
</script>

<template>
  <CatalogEditorDialog kind="section" title="Копировать структуру" :valid="Boolean(name.trim())" :save="copy"
    save-action="confirm-copy-section" save-label="Создать копию" @close="emit('close')" @saved="emit('copied', $event)">
    <p class="copy-description">В новый раздел скопируются описание и поля раздела «{{ source.name }}». Порядок и настройки полей сохранятся. Список записей будет пустым.</p>
    <label class="control">
      Название нового раздела
      <input v-model="name" name="sectionName" required autofocus />
    </label>
    <label class="control">
      Коллекция
      <select v-model="collectionId" name="collectionId">
        <option :value="null">Без коллекции</option>
        <option v-for="collection in collections" :key="collection.id" :value="collection.id">{{ collection.name }}</option>
      </select>
    </label>
  </CatalogEditorDialog>
</template>

<style scoped>
.copy-description { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
</style>
