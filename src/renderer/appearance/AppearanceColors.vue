<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Palette } from 'lucide-vue-next';
import { useAppearanceStore } from '../stores/appearanceStore.js';
import { useThemeStore } from '../stores/themeStore.js';

const store = useAppearanceStore();
const theme = useThemeStore();
const media = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(media.matches);
const updateMode = () => { systemDark.value = media.matches; };
onMounted(() => media.addEventListener('change', updateMode));
onUnmounted(() => media.removeEventListener('change', updateMode));
const dark = computed(() => theme.theme === 'dark' || (theme.theme === 'system' && systemDark.value));
const roles = [
  { key: 'primaryColor', label: 'Основной цвет', detail: 'Кнопки, ссылки и выделение', light: '#075fc5', dark: '#83baff' },
  { key: 'secondaryColor', label: 'Вспомогательный цвет', detail: 'Фон и боковая панель', light: '#edf0f6', dark: '#20232b' },
] as const;
const palettes = [
  { label: 'Стандартная', primaryColor: null, secondaryColor: null },
  { label: 'Море', primaryColor: '#16747b', secondaryColor: '#83c9c0' },
  { label: 'Ирис', primaryColor: '#7053a5', secondaryColor: '#bda6d5' },
  { label: 'Терракота', primaryColor: '#a65139', secondaryColor: '#e2ad82' },
];
function selected(palette: typeof palettes[number]) {
  return store.appearance.primaryColor === palette.primaryColor && store.appearance.secondaryColor === palette.secondaryColor;
}
</script>

<template>
  <fieldset class="appearance-section" :disabled="!store.ready">
    <legend class="settings-title"><span><Palette :size="18" aria-hidden="true" />Цветовая гамма</span></legend>
    <div class="palette-options" role="group" aria-label="Готовые палитры">
      <button v-for="palette in palettes" :key="palette.label" type="button" class="palette-button"
        :aria-pressed="selected(palette)" :data-palette="palette.label"
        @click="store.setAppearance({ primaryColor: palette.primaryColor, secondaryColor: palette.secondaryColor })">
        <i aria-hidden="true" :style="{ '--swatch': palette.primaryColor ?? (dark ? roles[0].dark : roles[0].light),
          '--swatch-secondary': palette.secondaryColor ?? (dark ? roles[1].dark : roles[1].light) }"></i>
        {{ palette.label }}
      </button>
    </div>
    <div class="color-controls">
      <label v-for="role in roles" :key="role.key" class="color-choice">
        <span class="color-copy"><strong>{{ role.label }}</strong><small>{{ role.detail }}</small></span>
        <span class="color-well">
          <input type="color" :name="role.key" :aria-label="role.label"
            :value="store.appearance[role.key] ?? (dark ? role.dark : role.light)"
            @change="store.setAppearance({ [role.key]: ($event.target as HTMLInputElement).value })" />
        </span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.palette-options { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
.palette-button {
  display: inline-flex; flex: 1 0 auto; align-items: center; justify-content: center; gap: 5px; min-height: 29px; padding: 3px 7px;
  color: var(--text); background: var(--control); border: 1px solid var(--line); border-radius: 7px; font-size: .8571rem;
}
.palette-button[aria-pressed=true] { border-color: var(--accent); background: var(--tint); }
.palette-button:hover { background: var(--tint); }
.palette-button i {
  width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 15%);
  background: linear-gradient(130deg, var(--swatch) 50%, var(--swatch-secondary) 50%);
}
.color-controls { display: grid; }
.color-choice {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0;
  padding-block: 6px; cursor: pointer;
}
.color-choice + .color-choice { border-top: 1px solid var(--line); }
.color-choice:last-child { padding-bottom: 0; }
.color-copy { display: grid; overflow-wrap: anywhere; }
.color-copy strong { font-size: .9286rem; font-weight: 570; }
.color-copy small { color: var(--muted); font-size: .8214rem; }
.color-well { flex: none; display: inline-flex; }
.color-well input { appearance: none; padding: 0; width: 29px; height: 25px; border: 1px solid var(--line); border-radius: 6px; cursor: pointer; background: transparent; }
.color-well input::-webkit-color-swatch-wrapper { padding: 2px; }
.color-well input::-webkit-color-swatch { border: 0; border-radius: 3px; }
@container (max-width: 355px) { .palette-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-height: 580px) {
  .palette-options { margin-bottom: 5px; }
  .color-choice { padding-block: 4px; }
}
</style>
