<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Download } from 'lucide-vue-next';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { errorMessage, type Attachment } from './catalog';
import ModalPanel from './ModalPanel.vue';

const props = defineProps<{ files: Attachment[]; initialId: string; tableId: number; recordId: number | null; fieldKey: string }>();
const emit = defineEmits<{ close: [] }>();
const index = ref(props.files.findIndex(file => file.id === props.initialId));
const current = computed(() => props.files[index.value]);
const request = computed(() => ({ tableId: props.tableId, recordId: props.recordId, fieldKey: props.fieldKey, id: current.value.id }));
const src = ref('');
const loading = ref(true);
const previewError = ref('');
const saving = ref(false);
const saveError = ref('');

watch(request, async (input, _, onCleanup) => {
  let active = true;
  onCleanup(() => { active = false; });
  src.value = '';
  previewError.value = '';
  saveError.value = '';
  loading.value = true;
  try {
    const url = await getDesktopApi().previewAttachment(input);
    if (active) src.value = url;
  } catch (cause) {
    if (active) {
      loading.value = false;
      previewError.value = errorMessage(cause, 'Не удалось открыть изображение.');
    }
  }
}, { immediate: true });

function imageFinished(event: Event) {
  if ((event.target as HTMLImageElement).src !== src.value) return;
  loading.value = false;
  if (event.type === 'error') previewError.value = 'Не удалось показать изображение. Можно скачать исходный файл.';
}

function step(direction: number) {
  const next = index.value + direction;
  if (!saving.value && next >= 0 && next < props.files.length) index.value = next;
}

async function download() {
  if (saving.value) return;
  saving.value = true;
  saveError.value = '';
  try {
    await getDesktopApi().saveAttachmentAs(request.value);
  } catch (cause) {
    saveError.value = errorMessage(cause, 'Не удалось скачать вложение.');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ModalPanel class="photo-preview" :title="current.name" :busy="saving" @close="emit('close')"
    @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)">
    <div class="photo-stage" :aria-busy="loading">
      <p v-if="previewError" role="alert">{{ previewError }}</p>
      <p v-else-if="loading" role="status">Загрузка изображения…</p>
      <img v-if="src && !previewError" v-show="!loading" :key="src" :src="src" :alt="current.name"
        data-photo-preview @load="imageFinished" @error="imageFinished" />
    </div>
    <p v-if="saveError" class="photo-save-error form-error" role="alert">{{ saveError }}</p>
    <footer class="sheet-actions">
      <div v-if="files.length > 1" class="photo-navigation" role="group" aria-label="Фотографии поля">
        <button type="button" class="icon-button" data-action="previous-photo" aria-label="Предыдущее фото"
          :disabled="saving || index === 0" @click="step(-1)"><ChevronLeft :size="16" aria-hidden="true" /></button>
        <span aria-live="polite">{{ index + 1 }} из {{ files.length }}</span>
        <button type="button" class="icon-button" data-action="next-photo" aria-label="Следующее фото"
          :disabled="saving || index === files.length - 1" @click="step(1)"><ChevronRight :size="16" aria-hidden="true" /></button>
      </div>
      <button type="button" class="secondary" data-action="download-preview" :disabled="saving" @click="download">
        <Download :size="15" aria-hidden="true" />Скачать
      </button>
    </footer>
  </ModalPanel>
</template>

<style scoped>
.photo-preview { width: min(960px, calc(100vw - 24px)); height: min(720px, calc(100vh - 24px)); }
.photo-preview :deep(.sheet-heading h2) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.photo-stage {
  display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center;
  flex: 1; min-height: 0; padding: 8px; background: var(--canvas);
}
.photo-stage img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
.photo-stage p { padding-inline: 10px; color: var(--muted); text-align: center; overflow-wrap: anywhere; }
.photo-save-error { margin: 0; padding: 6px 16px; }
.photo-navigation { display: flex; align-items: center; gap: 8px; margin-inline-end: auto; }
.photo-navigation span { color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
