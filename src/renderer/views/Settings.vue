<script setup lang="ts">
import { computed } from 'vue';
import { RotateCcw } from 'lucide-vue-next';
import AppearanceTheme from '../appearance/AppearanceTheme.vue';
import AppearanceTypography from '../appearance/AppearanceTypography.vue';
import AppearanceColors from '../appearance/AppearanceColors.vue';
import DatabaseSettings from '../components/DatabaseSettings.vue';
import { DEFAULT_APPEARANCE } from '../../shared/settings.js';
import { useAppearanceStore } from '../stores/appearanceStore.js';

const appearance = useAppearanceStore();
const customized = computed(() => Object.entries(DEFAULT_APPEARANCE).some(
  ([key, value]) => appearance.appearance[key as keyof typeof DEFAULT_APPEARANCE] !== value));
</script>

<template>
  <section class="preferences-view">
    <header class="settings-header">
      <h1>Настройки</h1>
      <button type="button" class="secondary" data-action="reset-appearance"
        :disabled="!appearance.ready || !customized" @click="appearance.resetAppearance()">
        <RotateCcw :size="14" aria-hidden="true" />Сбросить шрифт и цвета
      </button>
    </header>
    <div v-if="appearance.error" class="settings-feedback">
      <span role="alert" class="form-error">{{ appearance.error }}</span>
      <button v-if="!appearance.ready" type="button" class="secondary" @click="appearance.load()">Повторить</button>
    </div>
    <div class="settings-grid">
      <div class="preference-group"><AppearanceTheme /></div>
      <div class="preference-group"><AppearanceTypography /></div>
      <div class="preference-group"><AppearanceColors /></div>
      <DatabaseSettings />
    </div>
    <span v-if="!appearance.error && (!appearance.ready || appearance.saving)" role="status" class="settings-status">
      {{ appearance.saving ? 'Сохранение…' : 'Загрузка…' }}
    </span>
  </section>
</template>

<style scoped>
.preferences-view {
  container-type: inline-size;
  display: grid;
  width: 100%;
  min-width: 0;
  align-content: start;
  gap: clamp(10px, 1.5vw, 20px);
}
.settings-header, .settings-feedback { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
.settings-header { justify-content: space-between; }
.settings-header h1 { margin: 0; }
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: clamp(10px, 1.2vw, 18px);
}
.settings-grid > .preference-group {
  container-type: inline-size;
  align-content: start;
  min-width: 0;
  padding: clamp(12px, 1.4vw, 22px);
}
.settings-grid :deep(.settings-title) {
  width: 100%;
  margin: 0 0 12px;
  padding: 0;
  font-size: 1.12rem;
  line-height: 1.25;
  font-weight: 650;
  letter-spacing: -.02em;
}
.settings-grid :deep(.settings-title > span) { display: flex; align-items: center; gap: 8px; }
.settings-grid :deep(.settings-title svg) { flex: none; color: var(--accent); }
.settings-status { font-size: .86rem; color: var(--muted); }
@container (max-width: 520px) {
  .settings-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-height: 580px) {
  .preferences-view, .settings-grid { gap: 9px; }
  .settings-grid > .preference-group { padding: 10px 12px; }
  .settings-grid :deep(.settings-title) { margin-bottom: 7px; }
}
</style>
