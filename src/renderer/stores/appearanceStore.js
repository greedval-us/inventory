import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { DEFAULT_APPEARANCE, validateAppearance } from '../../shared/settings.js';
import { getDesktopApi } from '../infrastructure/desktopApi.js';

export const useAppearanceStore = defineStore('appearance', () => {
  const appearance = shallowRef(DEFAULT_APPEARANCE);
  const ready = ref(false);
  const saving = ref(false);
  const error = ref('');
  let saved = DEFAULT_APPEARANCE;
  let loading;
  let revision = 0;
  let writes = Promise.resolve();

  function load() {
    if (ready.value || loading) return loading;
    error.value = '';
    loading = Promise.resolve().then(() => getDesktopApi().getAppearance())
      .then(value => {
        saved = validateAppearance(value);
        appearance.value = saved;
        ready.value = true;
      })
      .catch(() => { error.value = 'Не удалось загрузить настройки оформления.'; })
      .finally(() => { loading = undefined; });
    return loading;
  }

  function setAppearance(patch) {
    if (!ready.value) return;
    const next = validateAppearance({ ...appearance.value, ...patch });
    if (Object.keys(next).every(key => next[key] === appearance.value[key])) return writes;

    const current = ++revision;
    appearance.value = next;
    saving.value = true;
    error.value = '';
    writes = writes.then(async () => {
      // Rapid inputs update the preview immediately. Only persist the newest queued snapshot.
      if (current !== revision) return;
      try {
        saved = await getDesktopApi().setAppearance(next);
        if (current === revision) appearance.value = saved;
      } catch {
        if (current === revision) {
          appearance.value = saved;
          error.value = 'Не удалось сохранить оформление. Повторите изменение.';
        }
      } finally {
        if (current === revision) saving.value = false;
      }
    });
    return writes;
  }

  function resetAppearance() {
    return setAppearance(DEFAULT_APPEARANCE);
  }

  return { appearance, ready, saving, error, load, setAppearance, resetAppearance };
});
