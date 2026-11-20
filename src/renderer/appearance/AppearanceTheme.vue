<script setup lang="ts">
import { Check, SunMoon } from 'lucide-vue-next';
import { THEME_LABELS } from '../../shared/settings.js';
import { useThemeStore } from '../stores/themeStore.js';

const store = useThemeStore();
</script>

<template>
  <fieldset :disabled="!store.ready || store.saving">
    <legend class="settings-title"><span><SunMoon :size="18" aria-hidden="true" />Тема оформления</span></legend>
    <div class="theme-options">
      <label v-for="(label, theme) in THEME_LABELS" :key="theme" class="theme-option">
        <input type="radio" name="theme" :value="theme" :checked="store.theme === theme" @change="store.setTheme(theme)" />
        <span class="theme-preview" :class="'preview-' + theme" aria-hidden="true">
          <span class="sample-window"><i></i><i></i><i></i></span>
          <span v-if="store.theme === theme" class="selected-mark"><Check :size="11" :stroke-width="3" /></span>
        </span>
        <span class="theme-caption">{{ label }}</span>
      </label>
    </div>
    <p class="theme-help">Системная — как на компьютере.</p>
  </fieldset>
  <div v-if="store.error">
    <p role="alert" class="form-error">{{ store.error }}</p>
    <button v-if="!store.ready" type="button" class="secondary" @click="store.load">Повторить</button>
  </div>
  <p v-else-if="!store.ready || store.saving" role="status">{{ store.saving ? 'Сохранение темы…' : 'Загрузка темы…' }}</p>
</template>

<style scoped>
.theme-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.theme-option { position: relative; min-width: 0; display: grid; gap: 4px; cursor: pointer; }
.theme-option input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.theme-preview {
  position: relative; display: grid; place-items: center; height: clamp(46px, 7.5vh, 72px);
  border: 2px solid transparent; border-radius: 9px; background-clip: padding-box;
  background-image: linear-gradient(135deg, #bfdaff, #93b2e6 55%, #7e93c4);
  box-shadow: 0 0 0 1px var(--line); transition: box-shadow 150ms ease;
}
.theme-option input:checked + .theme-preview { box-shadow: 0 0 0 2px var(--accent); }
.theme-option input:focus-visible + .theme-preview { outline: 2px solid var(--accent); outline-offset: 3px; }
.preview-dark { background-image: linear-gradient(135deg, #27354d, #405479 60%, #655c83); }
.preview-system { background-image: linear-gradient(115deg, #adc4eb 0 49.5%, #465879 50% 75%, #353d50); }
.sample-window {
  --pane: #fafbfe; --rail: #dce5f4; --stroke: #a2aec1;
  width: 63%; max-width: 100px; height: 62%; display: grid; align-content: center; gap: 2px;
  border-radius: 4px; background: linear-gradient(90deg, var(--rail) 0 23%, var(--pane) 23%);
  box-shadow: 0 2px 5px rgb(15 30 58 / .20);
}
.sample-window i { height: 2px; margin-inline-start: 31%; width: 55%; background: var(--stroke); border-radius: 2px; }
.sample-window i:nth-child(2) { width: 37%; }
.sample-window i:nth-child(3) { width: 46%; }
.preview-dark .sample-window { --rail: #29303f; --pane: #424b5a; --stroke: #8a99af; }
.preview-system .sample-window { --rail: #dde5f3; --pane: #525e75; --stroke: #a2b4ce; }
.selected-mark {
  position: absolute; right: 3px; bottom: 3px; display: grid; place-items: center; width: 15px; height: 15px;
  border-radius: 50%; background: var(--text); color: var(--surface);
}
.theme-caption { text-align: center; font-size: .9rem; }
.theme-help { margin: 8px 0 0; color: var(--muted); font-size: .86rem; }
@media (max-height: 580px) { .theme-preview { height: 36px; } .theme-help { margin-top: 4px; } }
</style>
