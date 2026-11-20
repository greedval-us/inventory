<script setup lang="ts">
import { computed, ref } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { useRegistryStore } from '../stores/registryStore';
import { errorMessage, registryFieldLabels } from './catalog';
import ExportSectionFields from './ExportSectionFields.vue';
import ModalPanel from './ModalPanel.vue';

const emit = defineEmits<{ close: []; saved: [] }>();
const store = useRegistryStore();
const { tableId, collectionId } = store;
const tables = tableId === null ? store.scopedTables : store.tables.filter(table => table.id === tableId);
const fields = registryFieldLabels(tables);
const ids = tables.map(table => table.id);
const initiallyVisible = ids.filter(id => tableId !== null || store.shownTablesById.has(id));
type Mode = 'all' | 'filtered';
const mode = ref<Mode>(store.query.trim() || store.field || store.selectedCollectionIds.length || initiallyVisible.length !== ids.length ? 'filtered' : 'all');
const query = ref(store.query);
const field = ref(store.field);
const selected = ref<Record<Mode, number[]>>({ all: ids, filtered: initiallyVisible });
const columns = ref<Record<number, string[]>>(Object.fromEntries(tables.map(table => [table.id, table.fields.map(f => f.key)])));
const panel = ref<InstanceType<typeof ModalPanel>>();
const busy = ref(false);
const error = ref('');
const selectedTables = computed(() => tables.filter(table => selected.value[mode.value].includes(table.id)));
const validation = computed(() => {
  if (!selectedTables.value.length) return 'Выберите хотя бы один раздел.';
  const empty = selectedTables.value.find(table => !columns.value[table.id].length);
  return empty ? 'Выберите хотя бы один столбец в разделе «' + empty.name + '».' : '';
});

function toggleTable(id: number) {
  const current = selected.value[mode.value];
  selected.value[mode.value] = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
}
async function save() {
  if (busy.value || validation.value) return;
  busy.value = true;
  error.value = '';
  try {
    const sections = selectedTables.value.map(table => {
      const keys = new Set(columns.value[table.id]);
      return { tableId: table.id, fieldKeys: table.fields.filter(f => keys.has(f.key)).map(f => f.key) };
    });
    const result = await getDesktopApi().exportExcel({
      tableId, collectionId, sections,
      query: mode.value === 'filtered' ? query.value.trim() : '',
      field: mode.value === 'filtered' ? field.value : '',
    });
    if (result) {
      await panel.value?.finish();
      emit('saved');
    }
  } catch (cause) {
    error.value = errorMessage(cause, 'Не удалось сохранить книгу Excel.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <ModalPanel ref="panel" v-slot="{ cancel }" title="Экспорт в Excel" :busy="busy" @close="emit('close')">
    <form class="record-form export-form" @submit.prevent="save">
      <div class="form-scroll">
        <fieldset class="export-fields" :disabled="busy" @input="error = ''" @change="error = ''">
          <fieldset class="export-mode">
            <legend>Записи для выгрузки</legend>
            <div class="mode-options">
              <label><input v-model="mode" type="radio" name="exportMode" value="all" />Все записи</label>
              <label><input v-model="mode" type="radio" name="exportMode" value="filtered" />По фильтру</label>
            </div>
          </fieldset>
          <div v-if="mode === 'filtered'" class="export-search">
            <label class="control">Поиск
              <input v-model="query" type="search" name="exportQuery" placeholder="Искать по значениям" />
            </label>
            <label class="control">Поле поиска
              <select v-model="field" name="exportField">
                <option value="">Все поля</option>
                <option v-for="label in fields" :key="label" :value="label">{{ label }}</option>
              </select>
            </label>
          </div>
          <fieldset class="export-sheets">
            <legend>{{ tableId === null ? 'Разделы и столбцы' : 'Столбцы' }}</legend>
            <p v-if="tableId === null" class="export-help">Каждый выбранный раздел попадёт на отдельный лист.</p>
            <div v-if="tables.length > 1" class="section-links">
              <button type="button" class="registry-link-button" :disabled="selectedTables.length === tables.length"
                @click="selected[mode] = ids">Выбрать все разделы</button>
              <button type="button" class="registry-link-button" :disabled="!selectedTables.length"
                @click="selected[mode] = []">Снять выбор</button>
            </div>
            <div class="sheet-list">
              <ExportSectionFields v-for="table in tables" :key="table.id" v-model="columns[table.id]"
                :table="table" :single="tableId !== null" :selected="selected[mode].includes(table.id)" @toggle="toggleTable(table.id)" />
            </div>
          </fieldset>
        </fieldset>
      </div>
      <p v-if="validation || error" class="form-error" role="alert">{{ validation || error }}</p>
      <footer class="sheet-actions">
        <button type="button" class="secondary" :disabled="busy" @click="cancel">Отмена</button>
        <button type="submit" class="primary" data-action="confirm-export-excel" :disabled="busy || Boolean(validation)">
          {{ busy ? 'Сохранение…' : 'Сохранить .xlsx…' }}
        </button>
      </footer>
    </form>
  </ModalPanel>
</template>

<style scoped>
.export-fields { display: grid; gap: 14px; }
legend { margin: 0 0 6px; padding: 0; font-weight: 600; }
.mode-options, .mode-options label, .section-links { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.mode-options { gap: 16px; }
.mode-options label { cursor: pointer; }
.mode-options input { margin: 0; }
.export-search { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 8px; }
.export-help { margin: 0 0 5px; font-size: .9rem; }
.section-links { margin-bottom: 5px; font-size: .86rem; }
.sheet-list { border: 1px solid var(--line); border-radius: 9px; }
@media (max-width: 420px) { .export-search { grid-template-columns: minmax(0,1fr); } }
</style>
