<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { FileSpreadsheet } from 'lucide-vue-next';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { errorMessage, type ExcelImportBook, type ExcelImportReport, type TableSchema } from './catalog';
import ExcelImportReview from './ExcelImportReview.vue';
import ModalPanel from './ModalPanel.vue';

const props = defineProps<{ table: TableSchema }>();
const emit = defineEmits<{ close: []; imported: [added: number] }>();
const panel = ref<InstanceType<typeof ModalPanel>>();
const book = shallowRef<ExcelImportBook>();
const sheet = ref('');
const hasHeader = ref(true);
const report = shallowRef<ExcelImportReport>();
const phase = ref<'idle' | 'picking' | 'checking' | 'adding'>('idle');
const error = ref('');
const busy = computed(() => phase.value === 'picking' || phase.value === 'adding');
const canApply = computed(() => phase.value === 'idle' && report.value && report.value.rowCount > 0 && !report.value.issueCount);
let mounted = true;
let checkId = 0;

function release(token?: string) {
  if (token) void getDesktopApi().closeExcelImport({ token }).catch((cause: unknown) => console.warn('Inventory import cleanup', cause));
}
onBeforeUnmount(() => {
  mounted = false;
  release(book.value?.token);
});
onMounted(pick);

function forgetBook(cause: unknown, fallback: string) {
  if (!mounted) return;
  release(book.value?.token);
  book.value = undefined;
  report.value = undefined;
  error.value = errorMessage(cause, fallback);
}

async function pick() {
  if (phase.value !== 'idle') return;
  phase.value = 'picking';
  error.value = '';
  try {
    const next: ExcelImportBook | null = await getDesktopApi().openExcelImport({ tableId: props.table.id });
    if (!mounted) { release(next?.token); return; }
    if (!next) {
      if (!book.value) {
        await panel.value?.finish();
        emit('close');
      }
      return;
    }
    release(book.value?.token);
    book.value = next;
    sheet.value = next.sheetNames.find(name => name === props.table.name) ?? next.sheetNames[0] ?? '';
    hasHeader.value = true;
    await check();
  } catch (cause) {
    forgetBook(cause, 'Не удалось открыть книгу Excel.');
  } finally {
    if (mounted && phase.value === 'picking') phase.value = 'idle';
  }
}

async function check() {
  const current = ++checkId;
  report.value = undefined;
  error.value = '';
  if (!book.value || !sheet.value) return;
  phase.value = 'checking';
  try {
    const result = await getDesktopApi().checkExcelImport({ token: book.value.token, sheetName: sheet.value, hasHeader: hasHeader.value });
    if (mounted && current === checkId) report.value = result;
  } catch (cause) {
    if (mounted && current === checkId) error.value = errorMessage(cause, 'Не удалось проверить лист.');
  } finally {
    if (mounted && current === checkId) phase.value = 'idle';
  }
}

async function apply() {
  if (!canApply.value || !book.value || !report.value) return;
  phase.value = 'adding';
  try {
    const { added } = await getDesktopApi().applyExcelImport({ token: book.value.token, revision: report.value.revision });
    if (mounted) {
      await panel.value?.finish();
      emit('imported', added);
    }
  } catch (cause) {
    forgetBook(cause, 'Не удалось добавить записи. Выберите книгу для повторной проверки.');
  } finally {
    if (mounted) phase.value = 'idle';
  }
}
</script>

<template>
  <ModalPanel ref="panel" v-slot="{ cancel }" title="Заполнить из Excel" class="import-dialog" :busy="busy" @close="emit('close')">
    <form class="record-form" @submit.prevent="apply">
      <div class="form-scroll import-body">
        <p class="import-target">Новые записи в разделе <strong>«{{ table.name }}»</strong></p>
        <div class="book-line">
          <span v-if="book" class="book-name" :title="book.fileName"><FileSpreadsheet :size="16" aria-hidden="true" />{{ book.fileName }}</span>
          <button type="button" class="secondary" :disabled="phase !== 'idle'" data-action="pick-import-file" @click="pick">
            {{ book ? 'Выбрать другой файл…' : 'Выбрать файл Excel…' }}
          </button>
        </div>
        <template v-if="book">
          <div class="import-options">
            <label class="control">Лист книги
              <select v-model="sheet" name="importSheet" :disabled="busy" @change="check">
                <option v-for="name in book.sheetNames" :key="name" :value="name">{{ name }}</option>
              </select>
            </label>
            <label class="check-control"><input v-model="hasHeader" type="checkbox" name="importHeader" :disabled="busy" @change="check" />
              Первая строка содержит заголовки
            </label>
          </div>
          <p class="import-help">Столбцы Excel соответствуют полям раздела по порядку слева направо.</p>
        </template>
        <p v-if="phase === 'picking' || phase === 'checking'" role="status" class="import-help">
          {{ phase === 'picking' ? 'Открытие книги…' : 'Проверка строк…' }}
        </p>
        <p v-if="error" role="alert" class="form-error">{{ error }}</p>
        <ExcelImportReview v-if="book && report" :fields="book.fields" :report="report" />
      </div>
      <footer class="sheet-actions">
        <button type="button" class="secondary" :disabled="busy" @click="cancel">Отмена</button>
        <button type="submit" class="primary" :disabled="!canApply" data-action="confirm-import-excel">
          {{ phase === 'adding' ? 'Добавление…' : 'Добавить записи' }}
        </button>
      </footer>
    </form>
  </ModalPanel>
</template>

<style scoped>
.import-dialog { width: min(740px, calc(100% - 28px)); }
.import-body { display: grid; gap: 12px; align-content: start; }
.import-body p { margin: 0; }
.import-target, .book-name { overflow-wrap: anywhere; }
.import-help { color: var(--muted); font-size: .93rem; }
.book-line { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 5px 12px; }
.book-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.book-name svg { flex: none; color: var(--accent); }
.import-options { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: end; gap: 5px 14px; }
.import-options .check-control { min-height: 32px; }
@media (max-width: 580px) { .import-options { grid-template-columns: minmax(0,1fr); } }
</style>
