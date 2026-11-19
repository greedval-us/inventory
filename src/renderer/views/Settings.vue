<script setup lang="ts">
import { useThemeStore } from '../stores/themeStore.js';
const store = useThemeStore();
const themes = [
  { value: 'system', label: 'Системная' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];
</script>

<template>
  <section>
    <h1>Настройки</h1>
    <div class="panel">
      <fieldset :disabled="!store.ready || store.saving">
        <legend>Тема оформления</legend>
        <p>Системная тема повторяет настройки компьютера.</p>
        <div class="theme-options">
          <label v-for="option in themes" :key="option.value">
            <input type="radio" name="theme" :value="option.value"
              :checked="store.theme === option.value" @change="store.setTheme(option.value)" />
            {{ option.label }}
          </label>
        </div>
      </fieldset>
      <div v-if="store.error">
        <p role="alert">{{ store.error }}</p>
        <button v-if="!store.ready" type="button" @click="store.load">Повторить</button>
      </div>
      <p v-else-if="!store.ready || store.saving" role="status">
        {{ store.saving ? 'Сохранение темы…' : 'Загрузка темы…' }}
      </p>
    </div>
  </section>
</template>

<style scoped>
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
legend { padding: 0; font-size: 1.25rem; font-weight: 600; }
.theme-options { display: flex; flex-wrap: wrap; gap: 8px; }
label {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 9px 12px;
  cursor: pointer;
}
label:has(:checked) { border-color: var(--accent); background: var(--tint); }
input { accent-color: var(--accent); margin: 0; }
</style>
