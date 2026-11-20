<script setup lang="ts">
import { computed, ref } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { errorMessage, type RegistryRow, type TableSchema, type Values } from './catalog';
import ModalPanel from './ModalPanel.vue';
import RecordField from './RecordField.vue';

const props = defineProps<{ tables: TableSchema[]; initialTable: number | null; record: RegistryRow | null }>();
const emit = defineEmits<{ close: []; saved: [tableId: number] }>();
const selected = ref(props.record?.tableId ?? props.initialTable ?? (props.tables.length === 1 ? props.tables[0].id : null));
const table = computed(() => props.tables.find(t => t.id === selected.value));
function emptyValues(): Values {
  return Object.fromEntries((table.value?.fields ?? []).map(field => [
    field.key, field.type === 'checkbox' && !field.required ? false : null,
  ]));
}
const values = ref<Values>(props.record ? { ...props.record.values } : emptyValues());
const busy = ref(false);
const panel = ref<InstanceType<typeof ModalPanel>>();
const error = ref('');

function changeTable() {
  values.value = emptyValues();
  error.value = '';
}

async function save() {
  if (!table.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const data: Values = {};
    for (const field of table.value.fields) {
      const value = values.value[field.key];
      data[field.key] = value == null || value === '' ? null : value;
    }
    const payload = { tableId: table.value.id, values: data };
    await getDesktopApi().saveRecord(props.record ? { ...payload, id: props.record.id } : payload);
    await panel.value?.finish();
    emit('saved', payload.tableId);
  } catch (cause) {
    error.value = errorMessage(cause, 'Не удалось сохранить запись.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <ModalPanel ref="panel" v-slot="{ cancel }" :title="record ? 'Редактирование записи' : 'Новая запись'"
    :busy="busy" @close="emit('close')">
    <form class="record-form" @submit.prevent="save">
      <div class="form-scroll">
        <fieldset :disabled="busy">
          <label class="control section-choice">
            Раздел
            <select v-model="selected" name="tableId" required :disabled="!!record" :autofocus="!record" @change="changeTable">
              <option :value="null" disabled>Выберите раздел</option>
              <option v-for="t in tables" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
          <p v-if="table?.fields.some(field => field.required)" class="required-note">* — обязательное поле</p>
          <div v-if="table" class="record-fields">
            <RecordField v-for="field in table.fields" :key="field.key" v-model="values[field.key]" :field="field" />
          </div>
        </fieldset>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <footer class="sheet-actions">
        <button type="button" class="secondary" :disabled="busy" @click="cancel">Отмена</button>
        <button class="primary" data-action="save-record" :disabled="!table || busy">Сохранить</button>
      </footer>
    </form>
  </ModalPanel>
</template>

<style scoped>
.required-note { margin: 12px 0 0; color: var(--muted); font-size: 0.8571rem; }
.required-note + .record-fields { margin-top: 6px; }
</style>
