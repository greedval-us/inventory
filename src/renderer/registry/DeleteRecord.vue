<script setup lang="ts">
import { computed, ref } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { displayCell, errorMessage, type TableSchema, type RegistryRow } from './catalog';
import ModalPanel from './ModalPanel.vue';

const props = defineProps<{ record: RegistryRow; table: TableSchema }>();
const emit = defineEmits<{ close: []; deleted: [] }>();
const busy = ref(false);
const panel = ref<InstanceType<typeof ModalPanel>>();
const error = ref('');
const preview = computed(() => {
  const field = props.table.fields.find(f => props.record.values[f.key] != null && props.record.values[f.key] !== '');
  return field ? field.label + ' — ' + displayCell(field.type, props.record.values[field.key]) : '';
});
async function remove() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await getDesktopApi().deleteRecord({ tableId: props.record.tableId, id: props.record.id });
    await panel.value?.finish();
    emit('deleted');
  } catch (cause) {
    error.value = errorMessage(cause, 'Не удалось удалить запись.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <ModalPanel ref="panel" v-slot="{ cancel }" class="confirm-sheet" title="Удалить запись?" :busy="busy" @close="emit('close')">
    <div class="form-scroll confirm-message">
      <p>Запись № {{ record.id }} будет удалена из раздела «{{ table.name }}».</p>
      <p v-if="preview" class="delete-preview">{{ preview }}</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </div>
    <footer class="sheet-actions">
      <button type="button" class="secondary" autofocus :disabled="busy" @click="cancel">Отмена</button>
      <button type="button" class="danger" data-action="confirm-delete" :disabled="busy" @click="remove">Удалить запись</button>
    </footer>
  </ModalPanel>
</template>
