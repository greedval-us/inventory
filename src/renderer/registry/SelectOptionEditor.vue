<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { Plus, X } from 'lucide-vue-next';
import type { OptionDraft } from './fieldDraft';

const choices = defineModel<OptionDraft[]>({ required: true });
const panel = ref<HTMLDetailsElement>();
let nextId = choices.value.reduce((max, option) => Math.max(max, option.id), -1) + 1;

async function focusOption(id: number) {
  await nextTick();
  panel.value?.querySelector<HTMLElement>('[data-choice-id="' + id + '"] [name=optionLabel]')?.focus();
}
function appendOption() {
  const choice = { id: nextId++, source: null, label: '' };
  choices.value.push(choice);
  focusOption(choice.id);
}
function removeOption(index: number) {
  if (choices.value.length <= 1) return;
  choices.value.splice(index, 1);
  focusOption(choices.value[Math.min(index, choices.value.length - 1)].id);
}
</script>

<template>
  <details ref="panel" class="option-editor" @invalid.capture="panel && (panel.open = true)">
    <summary data-action="edit-options">Варианты списка ({{ choices.length }})</summary>
    <div class="option-list">
      <div v-for="(choice, index) in choices" :key="choice.id" :data-choice-id="choice.id"
        :data-option-source="choice.source" class="option-item">
        <label class="control">
          <span class="field-sr-label">Название варианта {{ index + 1 }}</span>
          <textarea v-if="choice.source && /[\r\n]/.test(choice.source)" v-model="choice.label"
            name="optionLabel" rows="2" required />
          <input v-else v-model="choice.label" name="optionLabel" required />
        </label>
        <button type="button" class="icon-button" data-action="remove-option" :disabled="choices.length === 1"
          :aria-label="'Убрать вариант «' + (choice.label || index + 1) + '»'" title="Убрать вариант" @click="removeOption(index)">
          <X :size="14" aria-hidden="true" />
        </button>
      </div>
      <button type="button" class="secondary" data-action="add-option" @click="appendOption">
        <Plus :size="14" aria-hidden="true" />Добавить вариант
      </button>
    </div>
  </details>
</template>

<style scoped>
.option-editor { grid-column: 1 / -1; min-width: 0; }
.option-list { display: grid; gap: 4px; padding: 5px 0 4px 12px; border-inline-start: 1px solid var(--line); }
.option-item { display: grid; grid-template-columns: minmax(0, 1fr) 28px; gap: 4px; align-items: center; }
.option-item .icon-button { width: 28px; height: 28px; padding: 0; color: var(--muted); }
.option-item .icon-button:hover:enabled { color: var(--danger); }
.option-list > button { justify-self: start; }
</style>
