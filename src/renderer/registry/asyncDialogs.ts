import { defineAsyncComponent } from 'vue';

export const SectionEditor = defineAsyncComponent(() => import('./SectionEditor.vue'));
export const RecordEditor = defineAsyncComponent(() => import('./RecordEditor.vue'));
export const ImportExcelDialog = defineAsyncComponent(() => import('./ImportExcelDialog.vue'));
export const ExportExcelDialog = defineAsyncComponent(() => import('./ExportExcelDialog.vue'));
export const PhotoPreviewDialog = defineAsyncComponent(() => import('./PhotoPreviewDialog.vue'));
