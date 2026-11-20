<script setup lang="ts">
import { useAppearanceStore } from '../stores/appearanceStore.js';
import { FONT_LABELS, FONT_SIZES } from '../../shared/settings.js';

const store = useAppearanceStore();
</script>

<template>
  <fieldset class="appearance-section" :disabled="!store.ready">
    <legend>Текст интерфейса</legend>
    <div class="type-controls">
      <label class="control">
        Шрифт
        <select name="fontFamily" :value="store.appearance.fontFamily"
          @change="store.setAppearance({ fontFamily: ($event.target as HTMLSelectElement).value })">
          <option v-for="(label, id) in FONT_LABELS" :key="id" :value="id">{{ label }}</option>
        </select>
      </label>
      <fieldset class="size-control">
        <legend>Размер, пиксели</legend>
        <div class="size-options">
          <label v-for="size in FONT_SIZES" :key="size">
            <input type="radio" name="fontSize" :value="size" :checked="store.appearance.fontSize === size"
              @change="store.setAppearance({ fontSize: size })" />
            <span>{{ size }}</span>
          </label>
        </div>
      </fieldset>
    </div>
  </fieldset>
</template>

<style scoped>
.type-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; }
.size-control legend { margin: 0 0 4px; font-weight: 550; font-size: .9286rem; }
.size-options { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--canvas); }
.size-options label { position: relative; min-width: 0; cursor: pointer; }
.size-options input { position: absolute; opacity: 0; height: 1px; width: 1px; }
.size-options span { min-height: 25px; display: grid; place-items: center; color: var(--muted); font-variant-numeric: tabular-nums; border-radius: 5px; }
.size-options input:checked + span { background: var(--control); box-shadow: 0 0 0 1px var(--line), var(--shadow); color: var(--text); font-weight: 650; }
.size-options input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 1px; }
@media (max-width: 460px) { .type-controls { grid-template-columns: 1fr; } }
</style>
