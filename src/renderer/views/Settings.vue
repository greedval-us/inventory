<script setup lang="ts">
import { Check } from 'lucide-vue-next';
import { computed } from 'vue';
import AppearanceColors from '../appearance/AppearanceColors.vue';
import AppearanceTypography from '../appearance/AppearanceTypography.vue';
import { DEFAULT_APPEARANCE, THEME_LABELS } from '../../shared/settings.js';
import { useAppearanceStore } from '../stores/appearanceStore.js';
import { useThemeStore } from '../stores/themeStore.js';
const store = useThemeStore();
const appearance = useAppearanceStore();
const customized = computed(() => Object.entries(DEFAULT_APPEARANCE).some(
  ([key, value]) => appearance.appearance[key as keyof typeof DEFAULT_APPEARANCE] !== value));
</script>

<template>
  <section class="form-page preferences-view">
    <h1>Настройки</h1>
    <div class="preference-group appearance-pane">
      <fieldset :disabled="!store.ready || store.saving">
        <legend>Тема оформления</legend>
        <p class="appearance-help">Системная тема повторяет настройки компьютера.</p>
        <div class="theme-options">
          <label v-for="(label, theme) in THEME_LABELS" :key="theme" class="theme-option">
            <input type="radio" name="theme" :value="theme"
              :checked="store.theme === theme" @change="store.setTheme(theme)" />
            <span class="theme-preview" :class="'preview-' + theme" aria-hidden="true">
              <span class="sample-window"><i></i><i></i><i></i></span>
            </span>
            <span class="theme-caption">{{ label }}
              <Check v-if="store.theme === theme" :size="14" :stroke-width="3" aria-hidden="true" />
            </span>
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
      <AppearanceTypography />
      <AppearanceColors />
      <div class="appearance-actions">
        <button type="button" class="secondary" data-action="reset-appearance"
          :disabled="!appearance.ready || !customized" @click="appearance.resetAppearance()">
          Сбросить шрифт и цвета
        </button>
        <span v-if="appearance.error" role="alert" class="form-error">{{ appearance.error }}</span>
        <button v-if="appearance.error && !appearance.ready" type="button" class="secondary" @click="appearance.load()">Повторить</button>
        <span v-else-if="!appearance.ready || appearance.saving" role="status">
          {{ appearance.saving ? 'Сохранение…' : 'Загрузка…' }}
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.appearance-pane { display: grid; gap: 18px; }
legend, :deep(.appearance-section > legend) { padding: 0; font-size: 1.1429rem; font-weight: 650; letter-spacing: -.02em; }
.appearance-help { margin: 4px 0 11px; color: var(--muted); font-size: .9286rem; }
:deep(.appearance-section > legend) { margin-bottom: 8px; }
.appearance-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; border-top: 1px solid var(--line); padding-top: 12px; }
.appearance-actions > span { font-size: .8571rem; color: var(--muted); }
.appearance-actions > [role=alert] { color: var(--danger); }
.theme-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; max-width: 456px; }
.theme-option { position: relative; min-width: 0; display: grid; gap: 6px; cursor: pointer; }
.theme-option input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.theme-preview {
  display: grid; place-items: center; height: clamp(48px, 8vw, 74px);
  border: 2px solid transparent; border-radius: 9px; background-clip: padding-box;
  background-image: linear-gradient(132deg, #9ebeff, #7b9ce7 46%, #606db1);
  box-shadow: 0 0 0 1px var(--line); transition: box-shadow 140ms ease;
}
.theme-option input:checked + .theme-preview { box-shadow: 0 0 0 2px var(--accent); }
.theme-option input:focus-visible + .theme-preview { outline: 2px solid var(--accent); outline-offset: 4px; }
.preview-dark { background-image: linear-gradient(132deg, #263952, #3b4e85 55%, #594b81); }
.preview-system { background-image: linear-gradient(110deg, #a2bbf4 0 49.5%, #435582 50% 75%, #383457); }
.sample-window {
  --pane: #fafbfe; --rail: #dce5f4; --stroke: #a2aec1;
  width: 66%; height: 59%; padding: 7% 9% 4% 23%; display: grid; gap: 2px; align-content: center;
  border-radius: 4px; background: linear-gradient(90deg, var(--rail) 0 27%, var(--pane) 27%);
  box-shadow: 0 2px 5px rgb(15 30 58 / .20);
}
.sample-window i { height: 2px; width: 85%; background: var(--stroke); border-radius: 2px; }
.sample-window i:nth-child(2) { width: 64%; }
.sample-window i:nth-child(3) { width: 73%; }
.preview-dark .sample-window { --rail: #29303f; --pane: #424b5a; --stroke: #8a99af; }
.preview-system .sample-window { --rail: #dde5f3; --pane: #525e75; --stroke: #a2b4ce; }
.theme-caption { display: flex; align-items: center; justify-content: center; gap: 4px; font-size: .9286rem; }
.theme-caption svg { color: var(--accent); }
@media (max-height: 600px) {
  .preferences-view { gap: 8px; }
  .appearance-pane { gap: 10px; }
  .appearance-help { margin-block: 1px 6px; }
  .theme-preview { height: 38px; }
  .theme-option { gap: 3px; }
  :deep(.appearance-section > legend) { margin-bottom: 4px; }
  .appearance-actions { padding-top: 7px; }
}
</style>
