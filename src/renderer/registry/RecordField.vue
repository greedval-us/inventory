<script setup lang="ts">
import { computed } from 'vue';
import type { Cell, TableField } from './catalog';

const props = defineProps<{ field: TableField }>();
const value = defineModel<Cell>({ required: true });
const hintId = computed(() => props.field.hint ? 'record-hint-' + props.field.key : undefined);
const choice = computed({
  get: () => value.value ?? '',
  set: (selected: Cell) => { value.value = selected === '' ? null : selected; },
});
</script>

<template>
  <div class="record-field">
    <label v-if="field.type === 'checkbox' && !field.required" class="check-control">
      <input v-model="value" type="checkbox" :name="field.key" :aria-describedby="hintId" /> {{ field.label }}
    </label>
    <label v-else class="control">
      <span v-if="field.required">{{ field.label }} <span class="required-mark" aria-hidden="true">*</span></span>
      <template v-else>{{ field.label }}</template>
      <select v-if="field.type === 'select' || field.type === 'checkbox'" v-model="choice" :name="field.key"
        :required="field.required" :aria-describedby="hintId">
        <option value="" :disabled="field.required">{{ field.required ? 'Выберите значение' : 'Не выбрано' }}</option>
        <template v-if="field.type === 'checkbox'">
          <option :value="true">Да</option>
          <option :value="false">Нет</option>
        </template>
        <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
      </select>
      <input v-else-if="field.type === 'number'" v-model.number="value" type="number" step="any" :name="field.key"
        :required="field.required" :aria-describedby="hintId" />
      <textarea v-else-if="field.type === 'text'" v-model="value" rows="1" :name="field.key"
        :required="field.required" :aria-describedby="hintId" />
      <input v-else v-model="value" :type="field.type === 'datetime' ? 'datetime-local' : field.type" :name="field.key"
        :required="field.required" :aria-describedby="hintId" />
    </label>
    <small v-if="field.hint" :id="hintId" class="field-hint">{{ field.hint }}</small>
  </div>
</template>

<style scoped>
.record-field { min-width: 0; }
.record-field:only-child { grid-column: 1 / -1; }
.record-field:has(.check-control) { align-self: end; }
.required-mark { color: var(--accent); }
.field-hint { display: block; margin-top: 3px; font-size: 0.8571rem; color: var(--muted); overflow-wrap: anywhere; }
</style>
