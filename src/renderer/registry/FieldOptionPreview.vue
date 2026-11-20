<script setup lang="ts">
import { ref, watch } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { errorMessage } from './catalog';

const props = defineProps<{ tableId: number; fieldKey: string }>();
const additional = defineModel<string>({ required: true });
const preview = ref<{ options: string[]; total: number } | null>(null);
const error = ref('');

watch(() => [props.tableId, props.fieldKey] as const, async ([tableId, fieldKey], _, onCleanup) => {
  let active = true;
  onCleanup(() => { active = false; });
  preview.value = null;
  error.value = '';
  try {
    const result = await getDesktopApi().previewFieldOptions({ tableId, fieldKey });
    if (active) preview.value = result;
  } catch (cause) {
    if (active) error.value = errorMessage(cause, 'Не удалось загрузить варианты из записей.');
  }
}, { immediate: true });
</script>

<template>
  <div class="converted-options">
    <div data-preview="field-options" aria-live="polite">
      <p v-if="error" class="form-error">{{ error }}</p>
      <p v-else-if="!preview">Загружаем значения из записей…</p>
      <template v-else-if="preview.total">
        <p>Значения из записей станут вариантами списка. Повторы объединятся.</p>
        <ul aria-label="Варианты из записей">
          <li v-for="option in preview.options" :key="option" :title="option">{{ option }}</li>
        </ul>
        <p v-if="preview.total > preview.options.length">Ещё {{ preview.total - preview.options.length }}</p>
      </template>
      <p v-else>В записях это поле пустое. Добавьте хотя бы один вариант.</p>
    </div>
    <label class="control">
      Дополнительные варианты, по одному на строке
      <textarea v-model="additional" name="additionalFieldOptions" rows="2" />
    </label>
  </div>
</template>

<style scoped>
.converted-options { min-width: 0; grid-column: 1 / -1; display: grid; gap: 7px; padding-bottom: 4px; }
.converted-options p { margin: 0; font-size: 0.8571rem; }
[data-preview] { color: var(--muted); }
ul { display: flex; flex-wrap: wrap; gap: 4px; margin: 5px 0; padding: 0; list-style: none; }
li {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 2px 7px; border-radius: 6px; background: var(--tint); color: var(--text); font-size: 0.8571rem;
}
</style>
