<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next';
import { ref } from 'vue';
import type { TableSchema } from './catalog';

const props = defineProps<{ table: TableSchema; selected: boolean; single: boolean }>();
const columns = defineModel<string[]>({ required: true });
const emit = defineEmits<{ toggle: [] }>();
const expanded = ref(props.single);
</script>

<template>
  <div class="export-section">
    <div class="export-section-heading">
      <label v-if="!single" class="section-choice-label">
        <input type="checkbox" name="exportSection" :value="table.id" :checked="selected" @change="emit('toggle')" />
        <strong>{{ table.name }}</strong>
      </label>
      <strong v-else>{{ table.name }}</strong>
      <button class="column-toggle" type="button" data-action="toggle-export-columns" :data-table-id="table.id"
        :aria-expanded="expanded" :aria-controls="'export-columns-' + table.id"
        :aria-label="'Столбцы раздела «' + table.name + '»'" @click="expanded = !expanded">
        Столбцы {{ columns.length }}/{{ table.fields.length }} <ChevronDown :size="14" aria-hidden="true" />
      </button>
    </div>
    <div v-if="expanded" :id="'export-columns-' + table.id" class="column-options">
      <div class="column-links">
        <button type="button" class="registry-link-button" :disabled="columns.length === table.fields.length"
          @click="columns = table.fields.map(field => field.key)">Выбрать все</button>
        <button type="button" class="registry-link-button" :disabled="!columns.length" @click="columns = []">Снять выбор</button>
      </div>
      <div class="column-list">
        <label v-for="field in table.fields" :key="field.key">
          <input v-model="columns" type="checkbox" name="exportColumn" :data-table-id="table.id" :value="field.key" />
          <span>{{ field.label }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-section + .export-section { border-top: 1px solid var(--line); }
.export-section-heading, .section-choice-label, .column-toggle, .column-list label { display: flex; align-items: center; gap: 7px; }
.export-section-heading { justify-content: space-between; min-width: 0; padding: 6px 10px; }
.export-section-heading strong, .column-list span { min-width: 0; overflow-wrap: anywhere; }
.section-choice-label, .column-list label { min-width: 0; cursor: pointer; }
input { flex: none; margin: 0; }
.column-toggle { flex: none; gap: 4px; border: 0; padding: 4px; background: transparent; color: var(--muted); font-size: .86rem; }
.column-toggle[aria-expanded=true] svg { transform: rotate(180deg); }
.column-toggle:hover { color: var(--accent); }
.column-options { padding: 3px 10px 9px; }
.column-links { display: flex; gap: 8px; margin-bottom: 4px; font-size: .86rem; }
.column-list { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(145px,100%),1fr)); gap: 4px 12px; }
.column-list label { font-size: .93rem; }
</style>
