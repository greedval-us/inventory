<script setup lang="ts">
import { Type } from 'lucide-vue-next';
import { useAppearanceStore } from '../stores/appearanceStore.js';
import { FONT_LABELS, FONT_SIZES } from '../../shared/settings.js';

const store = useAppearanceStore();
</script>

<template>
  <fieldset class="appearance-section" :disabled="!store.ready">
    <legend class="settings-title"><span><Type :size="18" aria-hidden="true" />Текст интерфейса</span></legend>
    <div class="type-controls">
      <label class="control type-row">
        <span>Шрифт</span>
        <select name="fontFamily" :value="store.appearance.fontFamily"
          @change="store.setAppearance({ fontFamily: ($event.target as HTMLSelectElement).value })">
          <option v-for="(label, id) in FONT_LABELS" :key="id" :value="id">{{ label }}</option>
        </select>
      </label>
      <div class="type-row">
        <span id="size-label">Размер, px</span>
        <div class="size-options" role="radiogroup" aria-labelledby="size-label">
          <label v-for="size in FONT_SIZES" :key="size">
            <input type="radio" name="fontSize" :value="size" :checked="store.appearance.fontSize === size"
              @change="store.setAppearance({ fontSize: size })" />
            <span>{{ size }}</span>
          </label>
        </div>
      </div>
    </div>
  </fieldset>
</template>

<style scoped>
.type-controls { display: grid; gap: 10px; }
.type-row { display: grid; grid-template-columns: minmax(72px, .65fr) minmax(125px, 1.35fr); align-items: center; gap: 8px; }
.type-row > span { font-size: .9286rem; font-weight: 550; }
.size-options { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--canvas); }
.size-options label { position: relative; min-width: 0; cursor: pointer; }
.size-options input { position: absolute; opacity: 0; height: 1px; width: 1px; }
.size-options span { min-height: 25px; display: grid; place-items: center; color: var(--muted); font-variant-numeric: tabular-nums; border-radius: 5px; }
.size-options input:checked + span { background: var(--control); box-shadow: 0 0 0 1px var(--line), var(--shadow); color: var(--text); font-weight: 650; }
.size-options input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 1px; }
@container (max-width: 240px) { .type-row { grid-template-columns: minmax(0, 1fr); gap: 3px; } }
</style>
