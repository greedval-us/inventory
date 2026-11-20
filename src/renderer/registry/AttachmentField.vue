<script setup lang="ts">
import { computed } from 'vue';
import { Download, Eye, Paperclip, X } from 'lucide-vue-next';
import { attachmentKind } from '../../shared/attachmentKinds.js';
import type { Attachment, TableField } from './catalog';

const props = defineProps<{ field: TableField; files: Attachment[] }>();
const emit = defineEmits<{ pick: []; remove: [id: string]; download: [id: string]; preview: [id: string] }>();
const kind = computed(() => attachmentKind(props.field.fileKind ?? 'any'));
const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
const numbers = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
function fileSize(bytes: number) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return numbers.format(value) + ' ' + units[unit];
}
</script>

<template>
  <fieldset class="attachment-field" :data-file-field="field.key">
    <legend>{{ field.label }}<template v-if="field.required"> <span class="required-mark">*</span></template></legend>
    <div class="file-toolbar">
      <button type="button" class="secondary" data-action="pick-attachments" :aria-describedby="field.hint ? 'record-hint-' + field.key : undefined"
        @click="emit('pick')"><Paperclip :size="14" aria-hidden="true" />Прикрепить файлы</button>
      <span v-if="kind && kind.value !== 'any'" class="file-kind" :title="kind.extensions.join(', ')">{{ kind.label }}</span>
    </div>
    <small v-if="field.hint" :id="'record-hint-' + field.key" class="file-hint">{{ field.hint }}</small>
    <ul v-if="files.length" class="file-list" :aria-label="'Вложения: ' + field.label">
      <li v-for="file in files" :key="file.id" :data-attachment-id="file.id">
        <button v-if="field.fileKind === 'image'" type="button" class="file-preview" data-action="preview-attachment" aria-haspopup="dialog"
          :aria-label="'Просмотреть ' + file.name" :title="'Просмотреть ' + file.name" @click="emit('preview', file.id)">
          <Eye :size="15" aria-hidden="true" /><span class="file-name">{{ file.name }}</span>
        </button>
        <span v-else class="file-name" :title="file.name">{{ file.name }}</span>
        <small class="file-size">{{ fileSize(file.size) }}</small>
        <button class="icon-button" type="button" data-action="save-attachment-as" :aria-label="'Скачать ' + file.name"
          title="Скачать файл" @click="emit('download', file.id)"><Download :size="14" aria-hidden="true" /></button>
        <button class="icon-button" type="button" data-action="remove-attachment" :aria-label="'Убрать ' + file.name"
          title="Убрать из записи" @click="emit('remove', file.id)"><X :size="14" aria-hidden="true" /></button>
      </li>
    </ul>
  </fieldset>
</template>

<style scoped>
.attachment-field { grid-column: 1 / -1; }
legend { margin-bottom: 4px; padding: 0; font-size: .9286rem; font-weight: 550; overflow-wrap: anywhere; }
.required-mark { color: var(--accent); }
.file-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 9px; }
.file-kind, .file-size, .file-hint { color: var(--muted); font-size: .8571rem; }
.file-hint { display: block; margin-top: 3px; overflow-wrap: anywhere; }
.file-list { margin: 6px 0 0; padding: 0; max-height: min(24vh, 11rem); overflow: auto; list-style: none; }
.file-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; align-items: center; gap: 5px; padding: 2px 3px; }
.file-list li + li { border-top: 1px solid var(--line); }
.file-name { font-size: .9286rem; overflow-wrap: anywhere; }
.file-preview {
  display: inline-flex; align-items: center; gap: 6px; justify-self: start; max-width: 100%; min-width: 0;
  padding: 3px 0; border: 0; background: transparent; color: var(--accent); font: inherit; text-align: start; cursor: pointer;
}
.file-preview svg { flex: none; }
.file-preview:hover .file-name { text-decoration: underline; }
.file-size { white-space: nowrap; font-variant-numeric: tabular-nums; }
.file-list .icon-button { width: 26px; height: 26px; border: 0; background: transparent; box-shadow: none; color: var(--muted); }
.file-list .icon-button:hover { color: var(--accent); background: var(--tint); }
.file-list [data-action="remove-attachment"]:hover { color: var(--danger); }
</style>
