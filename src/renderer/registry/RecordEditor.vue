<script setup lang="ts">
import { ref } from 'vue';
import type { RegistryRow, TableSchema } from './catalog';
import AttachmentField from './AttachmentField.vue';
import ModalPanel from './ModalPanel.vue';
import PhotoPreviewDialog from './PhotoPreviewDialog.vue';
import RecordField from './RecordField.vue';
import { useRecordDraft } from './useRecordDraft';

const props = defineProps<{ tables: TableSchema[]; initialTable: number | null; record: RegistryRow | null }>();
const emit = defineEmits<{ close: []; saved: [tableId: number] }>();
const panel = ref<InstanceType<typeof ModalPanel>>();
const preview = ref<{ fieldKey: string; id: string }>();
const { selected, table, values, busy, error, activity, changeTable, files, pick, remove, download, save } =
  useRecordDraft(props, async tableId => {
    await panel.value?.finish();
    emit('saved', tableId);
  });
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
            <template v-for="field in table.fields" :key="field.key">
              <AttachmentField v-if="field.type === 'files'" :field="field" :files="files(field.key)"
                @pick="pick(field.key)" @remove="remove(field.key, $event)" @download="download(field.key, $event)"
                @preview="preview = { fieldKey: field.key, id: $event }" />
              <RecordField v-else v-model="values[field.key]" :field="field" />
            </template>
          </div>
        </fieldset>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-else-if="activity" class="file-status" role="status">{{ activity }}</p>
      <footer class="sheet-actions">
        <button type="button" class="secondary" :disabled="busy" @click="cancel">Отмена</button>
        <button class="primary" data-action="save-record" :disabled="!table || busy">Сохранить</button>
      </footer>
    </form>
  </ModalPanel>
  <PhotoPreviewDialog v-if="preview && selected !== null" :files="files(preview.fieldKey)" :initial-id="preview.id"
    :table-id="selected" :record-id="record?.id ?? null" :field-key="preview.fieldKey" @close="preview = undefined" />
</template>

<style scoped>
.file-status { margin: 0; color: var(--muted); font-size: .86rem; }
.required-note { margin: 12px 0 0; color: var(--muted); font-size: 0.8571rem; }
.required-note + .record-fields { margin-top: 6px; }
</style>
