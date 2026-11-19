import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';

export const useThemeStore = defineStore('theme', () => {
  const theme = ref('system');
  const ready = ref(false);
  const saving = ref(false);
  const error = ref('');

  async function load() {
    ready.value = false;
    error.value = '';
    try {
      theme.value = await getDesktopApi().getTheme();
      ready.value = true;
    } catch {
      error.value = 'Не удалось прочитать настройку темы.';
    }
  }

  async function setTheme(value) {
    if (!ready.value || saving.value || theme.value === value) return;
    const previous = theme.value;
    theme.value = value;
    saving.value = true;
    error.value = '';
    try {
      theme.value = await getDesktopApi().setTheme(value);
    } catch {
      theme.value = previous;
      error.value = 'Не удалось сохранить тему. Выберите её ещё раз.';
    } finally {
      saving.value = false;
    }
  }

  return { theme, ready, saving, error, load, setTheme };
});
