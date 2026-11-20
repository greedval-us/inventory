<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { BookOpen, Check, Plus, SearchX } from 'lucide-vue-next';
import { useRegistryStore } from '../stores/registryStore';
import { useRegistryPageSize } from '../registry/useRegistryPageSize';
import type { RegistryRow } from '../registry/catalog';
import RecordGrid from '../registry/RecordGrid.vue';
import RegistrySearch from '../registry/RegistrySearch.vue';
import RegistryHeading from '../registry/RegistryHeading.vue';
import SectionResults from '../registry/SectionResults.vue';
import RecordEditor from '../registry/RecordEditor.vue';
import DeleteRecord from '../registry/DeleteRecord.vue';
import ExportExcelDialog from '../registry/ExportExcelDialog.vue';
import '../registry/registry-view.css';

const store = useRegistryStore();
const resultsArea = useRegistryPageSize(store);
const route = useRoute();
const router = useRouter();
const editing = ref(false);
const exporting = ref(false);
const record = ref<RegistryRow | null>(null);
const deleting = ref<RegistryRow | null>(null);
const deleteTable = computed(() => store.tables.find(table => table.id === deleting.value?.tableId));
const notice = ref('');
const loadedScope = ref('');
let noticeTimer: ReturnType<typeof setTimeout>;
const scope = computed(() => route.name === 'collection' ? 'collection' : route.name === 'section' ? 'section' : 'home');
const requestedId = computed(() => route.name === 'section' ? Number(route.params.id) : null);
const requestedCollectionId = computed(() => route.name === 'collection' ? Number(route.params.id) : null);
const scopeKey = computed(() => scope.value + '/' + (route.params.id ?? ''));
const selected = computed(() => store.tables.find(table => table.id === requestedId.value));
const collection = computed(() => store.collections.find(item => item.id === requestedCollectionId.value));
const title = computed(() => scope.value === 'section' ? selected.value?.name ?? 'Раздел'
  : scope.value === 'collection' ? collection.value?.name ?? 'Коллекция' : 'Все разделы');
const routeQuery = computed(() => typeof route.query.q === 'string' ? route.query.q : '');

function open() {
  editing.value = false;
  exporting.value = false;
  deleting.value = null;
  notice.value = '';
  loadedScope.value = '';
  return store.openRegistry({ tableId: requestedId.value, collectionId: requestedCollectionId.value, query: routeQuery.value });
}
watch([scopeKey, routeQuery], ([key, query], [previous]) => {
  if (route.name !== 'home' && route.name !== 'collection' && route.name !== 'section') return;
  if (key !== previous) open();
  else store.search(query);
}, { immediate: true });
watch(() => store.loading, loading => {
  if (!loading && store.ready && !store.error) loadedScope.value = scopeKey.value;
}, { immediate: true });

function showNotice(message: string) {
  clearTimeout(noticeTimer);
  notice.value = message;
  noticeTimer = setTimeout(() => { notice.value = ''; }, 2800);
}
onBeforeUnmount(() => clearTimeout(noticeTimer));

function changeQuery(value: string) {
  if (scope.value !== 'section') {
    return router.replace({ path: route.path, query: value ? { q: value } : {} });
  }
  store.search(value);
}

function edit(row: RegistryRow | null) {
  notice.value = '';
  record.value = row;
  editing.value = true;
}
async function saved(tableId: number) {
  editing.value = false;
  if (store.tableId != null && store.tableId !== tableId) {
    await router.push({ name: 'section', params: { id: tableId } });
  } else if (record.value) {
    await store.loadRows();
  } else {
    if (routeQuery.value) await changeQuery('');
    await store.resetSearch();
  }
  showNotice('Запись сохранена.');
}
async function deleted() {
  deleting.value = null;
  await store.loadRows();
  showNotice('Запись удалена.');
}
function exported() {
  exporting.value = false;
  showNotice('Книга Excel сохранена.');
}
async function imported(added: number) {
  await store.loadRows();
  showNotice(`Добавлено записей: ${added}.`);
}
</script>

<template>
  <section class="registry-view">
    <RegistryHeading :key="scopeKey" :title="title" :table="selected" :collection="collection" @add="edit(null)" @export="exporting = true"
      @changed="store.refreshAfterStructureChange()" @imported="imported" />
    <RegistrySearch v-if="store.ready && store.scopedTables.length" :scope="scope" @query="changeQuery" />
    <div ref="resultsArea" class="registry-content" :aria-busy="store.loading">
      <div v-if="store.error" class="panel">
        <p role="alert" class="form-error">{{ store.error }}</p>
        <button type="button" class="secondary" @click="store.ready ? store.loadRows() : open()">Повторить</button>
      </div>
      <p v-else-if="store.loading && loadedScope !== scopeKey" class="registry-loading" role="status">Загрузка записей…</p>
      <div v-else-if="collection && !store.scopedTables.length" class="registry-empty first-section">
        <BookOpen class="empty-symbol" :size="29" aria-hidden="true" /><h2>В коллекции пока нет разделов</h2>
        <p>Создайте раздел или выберите существующие через «Изменить».</p>
        <RouterLink class="primary" :to="{ name: 'new-section', query: { collection: collection.id } }">
          <Plus :size="15" aria-hidden="true" />Создать раздел
        </RouterLink>
      </div>
      <div v-else-if="!store.tables.length" class="registry-empty first-section">
        <div class="folder-art" aria-hidden="true"><i class="folder-back"></i><i class="folder-paper"></i><i class="folder-front"></i></div>
        <h2>Создайте первый раздел</h2>
        <p>Добавьте раздел и задайте поля для записей.</p>
        <RouterLink :to="{ name: 'new-section' }" class="primary"><Plus :size="15" aria-hidden="true" />Создать раздел</RouterLink>
      </div>
      <SectionResults v-else-if="requestedId == null" @edit="edit" @remove="deleting = $event" />
      <div v-else-if="!store.rows.length && store.query" class="registry-empty">
        <SearchX class="empty-symbol" :size="26" aria-hidden="true" />
        <h2>Совпадений нет</h2>
        <p>Измените запрос или выберите другое поле.</p>
      </div>
      <div v-else-if="selected" class="registry-card">
        <RecordGrid :table="selected" :rows="store.rows" :total="store.total" :offset="store.offset"
          :page-size="store.pageSize" @edit="edit" @remove="deleting = $event" />
      </div>
    </div>
    <Transition name="registry-toast">
      <div v-if="notice" role="status" class="registry-notice"><Check :size="15" aria-hidden="true" />{{ notice }}</div>
    </Transition>
    <RecordEditor v-if="editing" :tables="store.scopedTables" :initial-table="store.tableId" :record="record" @close="editing = false" @saved="saved" />
    <ExportExcelDialog v-if="exporting" @close="exporting = false" @saved="exported" />
    <DeleteRecord v-if="deleting && deleteTable" :record="deleting" :table="deleteTable" @close="deleting = null" @deleted="deleted" />
  </section>
</template>
