<script setup lang="ts">
import { computed, ref } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import CatalogEditorDialog from './CatalogEditorDialog.vue';
import FieldDesigner from './FieldDesigner.vue';
import SectionDetails from './SectionDetails.vue';
import { fieldDraft, fieldDefinitions, matchesStoredField } from './fieldDraft';
import type { Collection, TableSchema } from './catalog';

const props = defineProps<{ table: TableSchema; collections: Collection[]; deleteOnly?: boolean }>();
const emit = defineEmits<{ close: []; saved: []; deleted: [] }>();
const initialName = props.table.name;
const initialDescription = props.table.description;
const initialCollection = props.table.collectionId ?? null;
const name = ref(initialName);
const description = ref(initialDescription);
const collectionId = ref(initialCollection);
const originalFields = props.table.fields.map(field => ({
  ...field, ...(field.options ? { options: [...field.options] } : {}),
}));
const fields = ref(originalFields.map((field, index) => fieldDraft(index + 1, field)));
const changedFields = computed(() => fields.value.length !== originalFields.length || fields.value.some((field, index) =>
  !matchesStoredField(field, originalFields[index])));
const removedFieldNames = computed(() => {
  const retained = new Set(fields.value.map(field => field.source?.key));
  return originalFields.filter(field => !retained.has(field.key)).map(field => field.label);
});
const removedOptions = computed(() => fields.value.flatMap(field => {
  if (field.type !== 'select' || !field.source?.options) return [];
  const retained = new Set(field.choices.map(choice => choice.source));
  const labels = field.source.options.filter(option => !retained.has(option));
  return labels.length ? [{ field: field.source.label, labels }] : [];
}));
function readFields() {
  return fieldDefinitions(fields.value);
}

async function save() {
  await getDesktopApi().updateTable({
    id: props.table.id,
    ...(name.value.trim() !== initialName ? { name: name.value.trim() } : {}),
    ...(description.value !== initialDescription ? { description: description.value } : {}),
    ...(collectionId.value !== initialCollection ? { collectionId: collectionId.value } : {}),
    ...(changedFields.value ? { fields: readFields(), expectedFields: originalFields } : {}),
  });
}
async function remove() {
  await getDesktopApi().deleteTable({ id: props.table.id });
}
</script>

<template>
  <CatalogEditorDialog class="section-editor-dialog" kind="section" title="Настройки раздела" :valid="Boolean(name.trim())"
    :save="save" :validate="readFields" :removed-field-names="removedFieldNames" :removed-options="removedOptions"
    :remove="remove" :delete-only="deleteOnly" delete-label="Удалить раздел"
    :delete-message="'Раздел «' + table.name + '» и все его записи будут удалены без возможности восстановления.'"
    @close="emit('close')" @saved="emit('saved')" @deleted="emit('deleted')">
    <SectionDetails v-model:name="name" v-model:description="description" v-model:collection-id="collectionId"
      :collections="collections" editing />
    <FieldDesigner v-model="fields" :table-id="table.id" />
  </CatalogEditorDialog>
</template>
