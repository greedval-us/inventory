<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { ChevronLeft, ChevronRight, Images, Paperclip, Pencil, Trash2 } from 'lucide-vue-next';
import { useRegistryStore } from '../stores/registryStore';
import { displayCell, type Attachment, type RegistryRow, type TableField, type TableSchema } from './catalog';
import { PhotoPreviewDialog } from './asyncDialogs';
import SortableColumnHeader from './SortableColumnHeader.vue';
import { useColumnLayout } from './useColumnLayout';

const props = defineProps<{ table: TableSchema; rows: RegistryRow[]; total: number; offset: number; pageSize: number }>();
const store = useRegistryStore();
const sort = computed(() => store.sorts[props.table.id]);
const { table: grid, layout, preview, cancel } = useColumnLayout(() => props.table, () => store.columnWidths[props.table.id]);
const emit = defineEmits<{ edit: [row: RegistryRow]; remove: [row: RegistryRow] }>();
const photos = shallowRef<{ recordId: number; fieldKey: string; files: Attachment[] }>();

function openFiles(row: RegistryRow, field: TableField) {
  const files = row.values[field.key];
  if (field.fileKind === 'image' && Array.isArray(files) && files.length) {
    photos.value = { recordId: row.id, fieldKey: field.key, files };
  } else {
    emit('edit', row);
  }
}

function resize(key: string, width: number) {
  preview(key, width);
  store.resizeColumn(props.table.id, key, width);
  cancel();
}
</script>

<template>
  <p v-if="store.sortError?.tableId === table.id" role="alert" class="form-error">{{ store.sortError.message }}</p>
  <p v-if="store.widthError?.tableId === table.id" role="alert" class="form-error">{{ store.widthError.message }}</p>
  <div class="grid-scroll" role="region" :aria-label="table.name" tabindex="0">
    <table ref="grid" class="record-grid" :class="{ 'custom-columns': layout }"
      :style="layout ? { width: layout.total + 'px' } : undefined" :aria-label="table.name">
      <colgroup v-if="layout">
        <col v-for="(width, index) in layout.widths" :key="table.fields[index].key" :style="{ width: width + 'px' }" />
        <col :style="{ width: layout.actions + 'px' }" />
      </colgroup>
      <thead><tr>
        <SortableColumnHeader v-for="(field, index) in table.fields" :key="table.id + '/' + field.key"
          :field="field" :sort="sort" :width="layout?.widths[index]"
          @change="store.sortBy(table.id, field.key)" @preview="preview(field.key, $event)"
          @resize="resize(field.key, $event)" @cancel="cancel" />
        <th scope="col" class="row-actions">Действия</th>
      </tr></thead>
      <tbody><tr v-for="row in rows" :key="row.id">
        <td v-for="field in table.fields" :key="field.key" :data-kind="field.type">
          <button v-if="field.type === 'files' && Array.isArray(row.values[field.key]) && row.values[field.key].length"
            type="button" class="cell-files" aria-haspopup="dialog" :data-action="field.fileKind === 'image' ? 'view-photos' : 'view-attachments'"
            :title="displayCell(field.type, row.values[field.key])" @click="openFiles(row, field)">
            <component :is="field.fileKind === 'image' ? Images : Paperclip" :size="13" aria-hidden="true" />
            <span>{{ displayCell(field.type, row.values[field.key]) }}</span>
          </button>
          <span v-else :class="{ 'cell-flag': field.type === 'checkbox' && row.values[field.key] != null,
            enabled: field.type === 'checkbox' && row.values[field.key] === true }">{{ displayCell(field.type, row.values[field.key]) }}</span>
        </td>
        <td class="row-actions"><div>
          <button type="button" class="icon-button" data-action="edit-record"
            :aria-label="'Редактировать запись ' + row.id" title="Редактировать запись" @click="emit('edit', row)"><Pencil :size="14" /></button>
          <button type="button" class="icon-button" data-action="delete-record"
            :aria-label="'Удалить запись ' + row.id" title="Удалить запись" @click="emit('remove', row)"><Trash2 :size="14" /></button>
        </div></td>
      </tr>
      <tr v-if="!rows.length"><td :colspan="table.fields.length + 1" class="empty-section">Записей пока нет</td></tr>
      </tbody>
    </table>
  </div>
  <footer v-if="total > pageSize" class="grid-footer">
    <span>{{ offset + 1 }}–{{ offset + rows.length }} из {{ total }}</span>
    <div class="pager">
      <button type="button" class="icon-button" :aria-label="'Предыдущая страница — ' + table.name"
        :disabled="offset === 0" @click="store.goToPage(table.id, -1)"><ChevronLeft :size="18" /></button>
      <button type="button" class="icon-button" :aria-label="'Следующая страница — ' + table.name"
        :disabled="offset + rows.length >= total" @click="store.goToPage(table.id, 1)"><ChevronRight :size="18" /></button>
    </div>
  </footer>
  <PhotoPreviewDialog v-if="photos" :files="photos.files" :initial-id="photos.files[0].id" :table-id="table.id"
    :record-id="photos.recordId" :field-key="photos.fieldKey" @close="photos = undefined" />
</template>

<style scoped>
.cell-files {
  display: flex; align-items: baseline; gap: 5px; max-width: 100%; padding: 0;
  border: 0; background: transparent; color: var(--accent); font: inherit; text-align: start;
}
.cell-files svg { flex: none; align-self: flex-start; margin-top: 2px; }
.cell-files span {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; overflow-wrap: anywhere;
}
.cell-files:hover span { text-decoration: underline; }
</style>
