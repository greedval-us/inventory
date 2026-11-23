import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';

export const useInfoStore = defineStore('info', () => {
  const info = shallowRef(null);
  const loading = ref(false);
  const error = ref('');

  async function load() {
    if (loading.value || info.value) return;
    loading.value = true;
    error.value = '';
    try {
      info.value = await getDesktopApi().getInfo();
    } catch {
      error.value = 'Не удалось получить сведения о приложении.';
    } finally {
      loading.value = false;
    }
  }

  return { info, loading, error, load };
});
