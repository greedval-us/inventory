<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-vue-next';
import { FIELD_TYPE_LABELS } from '../../shared/catalogFields.js';
import { ATTACHMENT_KINDS } from '../../shared/attachmentKinds.js';
import { fieldDraft, type FieldDraft } from './fieldDraft';
import FieldOptionPreview from './FieldOptionPreview.vue';
import SelectOptionEditor from './SelectOptionEditor.vue';

defineProps<{ tableId?: number }>();
const fields = defineModel<FieldDraft[]>({ required: true });
const designer = ref<HTMLElement>();
let nextId = Math.max(0, ...fields.value.map(field => field.id));

async function focusRow(id: number, action?: string) {
  await nextTick();
  const row = designer.value?.querySelector<HTMLElement>('[data-field-id="' + id + '"]');
  const button = action ? row?.querySelector<HTMLButtonElement>('[data-action="' + action + '"]:enabled') : null;
  (button ?? row?.querySelector('input'))?.focus();
}
function appendField() {
  const field = fieldDraft(++nextId);
  fields.value.push(field);
  focusRow(field.id);
}
function moveField(id: number, offset: -1 | 1) {
  const index = fields.value.findIndex(field => field.id === id);
  if (index < 0 || index + offset < 0 || index + offset >= fields.value.length) return;
  const [field] = fields.value.splice(index, 1);
  fields.value.splice(index + offset, 0, field);
  focusRow(field.id, offset < 0 ? 'move-field-up' : 'move-field-down');
}
function removeField(id: number) {
  const index = fields.value.findIndex(field => field.id === id);
  if (index < 0 || fields.value.length === 1) return;
  fields.value.splice(index, 1);
  focusRow(fields.value[Math.min(index, fields.value.length - 1)].id);
}
</script>

<template>
  <section ref="designer" class="field-designer" aria-label="Поля записи">
    <div class="field-heading">
      <h3>Поля записи</h3>
      <button type="button" class="secondary" data-action="add-field" @click="appendField">
        <Plus :size="14" aria-hidden="true" />Добавить поле
      </button>
    </div>
    <div class="field-captions" aria-hidden="true"><span>Название поля</span><span>Тип поля</span></div>
    <TransitionGroup name="designer-field" tag="div" class="designer-fields">
      <div v-for="(field, index) in fields" :key="field.id" :data-field-id="field.id" :data-field-key="field.source?.key" class="designer-row">
        <label class="control"><span class="field-sr-label">Название поля {{ index + 1 }}</span><input v-model="field.label" name="fieldLabel" required /></label>
        <label class="control"><span class="field-sr-label">Тип поля {{ index + 1 }}</span>
          <select v-model="field.type" name="fieldType">
            <option v-for="(label, type) in FIELD_TYPE_LABELS" :key="type" :value="type">{{ label }}</option>
          </select>
        </label>
        <div class="field-buttons">
          <button type="button" class="icon-button" data-action="move-field-up" :disabled="index === 0"
            :aria-label="'Переместить поле «' + (field.label || (index + 1)) + '» выше'" title="Переместить выше" @click="moveField(field.id, -1)">
            <ChevronUp :size="15" aria-hidden="true" />
          </button>
          <button type="button" class="icon-button" data-action="move-field-down" :disabled="index === fields.length - 1"
            :aria-label="'Переместить поле «' + (field.label || (index + 1)) + '» ниже'" title="Переместить ниже" @click="moveField(field.id, 1)">
            <ChevronDown :size="15" aria-hidden="true" />
          </button>
          <button type="button" class="icon-button" data-action="remove-field" :disabled="fields.length === 1"
            :aria-label="'Убрать поле «' + (field.label || (index + 1)) + '»'" title="Убрать поле" @click="removeField(field.id)">
            <Trash2 :size="14" aria-hidden="true" />
          </button>
        </div>
        <div class="field-properties">
          <label class="check-control"><input v-model="field.required" name="fieldRequired" type="checkbox" />Обязательное поле</label>
          <details class="field-hint-editor">
            <summary data-action="edit-hint">{{ field.hint.trim() ? 'Изменить подсказку' : 'Добавить подсказку' }}</summary>
            <label class="control"><span class="field-sr-label">Подсказка при заполнении</span>
              <input v-model="field.hint" name="fieldHint" placeholder="Например, где найти серийный номер" />
            </label>
          </details>
        </div>
        <label v-if="field.type === 'files'" class="control list-options">
          Разрешённые файлы
          <select v-model="field.fileKind" name="fieldKind">
            <option v-for="kind in ATTACHMENT_KINDS" :key="kind.value" :value="kind.value">{{ kind.label }}</option>
          </select>
        </label>
        <template v-if="field.type === 'select'">
          <SelectOptionEditor v-if="field.source?.type === 'select'" v-model="field.choices" />
          <FieldOptionPreview v-else-if="field.source && tableId != null" v-model="field.options"
            :table-id="tableId" :field-key="field.source.key" />
          <label v-else class="control list-options">
            Варианты списка, по одному на строке
            <textarea v-model="field.options" name="fieldOptions" rows="2" required />
          </label>
        </template>
      </div>
    </TransitionGroup>
  </section>
</template>
