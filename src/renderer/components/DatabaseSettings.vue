<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Database, Paperclip } from 'lucide-vue-next';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { errorMessage } from '../registry/catalog';
import InfoState from './InfoState.vue';
import FileStorageSettings from './FileStorageSettings.vue';

const heading = ref<HTMLElement>();
const pane = ref<'database' | 'files'>('database');
const switching = ref(false);
const error = ref('');
const switched = ref(false);
const noticeKey = 'inventory-database-switched';

onMounted(() => {
  if (sessionStorage.getItem(noticeKey)) {
    sessionStorage.removeItem(noticeKey);
    switched.value = true;
    heading.value?.focus();
  }
});

async function choose(action: 'relocateDatabase' | 'openDatabase') {
  if (switching.value) return;
  switching.value = true;
  error.value = '';
  switched.value = false;
  try {
    const result = await getDesktopApi()[action]();
    if (result) {
      sessionStorage.setItem(noticeKey, '1');
      // Restart all stores so queued UI state and table preferences belong to this file.
      window.location.reload();
      return;
    }
  } catch (cause) {
    error.value = errorMessage(cause, 'Не удалось изменить расположение базы данных.');
  }
  switching.value = false;
}
</script>

<template>
  <section class="preference-group database-pane" aria-label="Хранение данных">
    <div class="storage-switch" role="group" aria-label="Настройки хранения">
      <button id="database-heading" ref="heading" type="button" :aria-pressed="pane === 'database'"
        @click="pane = 'database'"><Database :size="15" aria-hidden="true" />База данных</button>
      <button type="button" data-action="attachment-settings" :aria-pressed="pane === 'files'"
        @click="pane = 'files'"><Paperclip :size="15" aria-hidden="true" />Вложения</button>
    </div>
    <FileStorageSettings v-if="pane === 'files'" />
    <template v-else>
      <InfoState v-slot="{ info }">
        <label v-if="info.databasePath" class="control">
          Текущий файл
          <input name="databasePath" readonly :value="info.databasePath" :title="info.databasePath"
            @focus="($event.target as HTMLInputElement).select()" />
        </label>
        <p v-else>Расположение не задано. Выберите существующую базу Inventory.</p>
      </InfoState>
      <div class="database-actions">
        <button type="button" class="secondary" data-action="relocate-database" :disabled="switching"
          @click="choose('relocateDatabase')">Выбрать папку…</button>
        <button type="button" class="secondary" data-action="open-database" :disabled="switching"
          @click="choose('openDatabase')">Открыть базу…</button>
      </div>
      <p class="database-help">При переносе в другую папку исходный файл остаётся резервной копией.</p>
      <p v-if="error" role="alert" class="form-error">{{ error }}</p>
      <p v-else-if="switched" role="status">База данных подключена.</p>
    </template>
  </section>
</template>

<style scoped>
.storage-switch { display: inline-flex; align-items: center; gap: 2px; padding: 2px; margin-bottom: 8px; border-radius: 8px; background: var(--control); }
.storage-switch button { display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; font: inherit; font-size: .9em; color: var(--muted); border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
.storage-switch button[aria-pressed="true"] { color: var(--text); background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.storage-switch svg { color: var(--accent); }
.database-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
p { margin: 0; }
.database-help, .database-pane > [role] { margin-top: 8px; font-size: .86rem; }
.database-help { color: var(--muted); }
@container (max-width: 355px) {
  .database-actions { gap: 5px; }
  .database-actions .secondary { padding-inline: 7px; }
}
</style>
