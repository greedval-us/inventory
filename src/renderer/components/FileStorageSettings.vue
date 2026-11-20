<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { errorMessage } from '../registry/catalog';

const location = ref<{ folder: string; custom: boolean }>();
const busy = ref(false);
const error = ref('');
const notice = ref('');

async function change(action: 'getAttachmentFolder' | 'chooseAttachmentFolder' | 'resetAttachmentFolder') {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const result = await getDesktopApi()[action]();
    if (result) {
      location.value = result;
      if (action !== 'getAttachmentFolder') notice.value = 'Папка выбрана. Прежние файлы оставлены как резервная копия.';
    }
  } catch (cause) {
    error.value = errorMessage(cause, 'Не удалось открыть папку вложений.');
  } finally {
    busy.value = false;
  }
}
onMounted(() => change('getAttachmentFolder'));
</script>

<template>
  <div :aria-busy="busy">
    <label class="control">
      Папка для вложений
      <input name="attachmentFolder" readonly :value="location?.folder" :title="location?.folder"
        @focus="($event.target as HTMLInputElement).select()" />
    </label>
    <div class="folder-actions">
      <button type="button" class="secondary" data-action="choose-attachment-folder" :disabled="busy"
        @click="change('chooseAttachmentFolder')">Выбрать папку…</button>
      <button v-if="location?.custom" type="button" class="secondary" data-action="reset-attachment-folder" :disabled="busy"
        @click="change('resetAttachmentFolder')">Вернуть по умолчанию</button>
    </div>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
    <p v-else-if="busy || notice" role="status">{{ busy ? 'Подготовка папки…' : notice }}</p>
    <p v-else class="hint">{{ location?.custom ? 'Используется выбранная папка.' : 'По умолчанию файлы хранятся рядом с базой.' }}</p>
  </div>
</template>

<style scoped>
.folder-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
p { margin: 8px 0 0; font-size: .86rem; }
p[role="status"], .hint { color: var(--muted); }
</style>
