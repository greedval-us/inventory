<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Archive, Info, LayoutGrid, PanelLeft, Settings } from 'lucide-vue-next';
import { useRegistryStore } from '../stores/registryStore';
import type { Collection, TableSchema } from '../registry/catalog';
import CollectionEditor from '../registry/CollectionEditor.vue';
import { SectionEditor } from '../registry/asyncDialogs';
import LibraryNavigation from './LibraryNavigation.vue';

const registry = useRegistryStore();
const route = useRoute();
const router = useRouter();
const sidebar = ref<HTMLElement>();
const menuButton = ref<HTMLButtonElement>();
const menuOpen = ref(false);
const creatingCollection = ref(false);
const deletingSection = shallowRef<TableSchema | null>(null);
const compact = window.matchMedia('(max-width: 760px)');
const links = [
  { name: 'settings', label: 'Настройки', icon: Settings },
  { name: 'info', label: 'О приложении', icon: Info },
];

function showAllRecords(event: MouseEvent) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || route.name !== 'home') return;
  registry.showAllSections();
  if (registry.field || registry.visibleSections.some(group => group.offset > 0)) registry.resetSearch();
}
function closeMenu() { menuOpen.value = false; }
function openCollectionEditor() {
  closeMenu();
  creatingCollection.value = true;
}
async function closeCollectionEditor() {
  creatingCollection.value = false;
  await nextTick();
  if (compact.matches) menuButton.value?.focus();
  else sidebar.value?.querySelector<HTMLElement>('[data-action="new-collection"]')?.focus();
}
async function collectionSaved(collection: Collection) {
  creatingCollection.value = false;
  await registry.refreshTables(true);
  await router.push({ name: 'collection', params: { id: collection.id } });
}
function requestDeletion(table: TableSchema) {
  closeMenu();
  deletingSection.value = table;
}
async function cancelDeletion() {
  const id = deletingSection.value?.id;
  deletingSection.value = null;
  await nextTick();
  if (compact.matches) menuButton.value?.focus();
  else sidebar.value?.querySelector<HTMLElement>('[data-drag-section="' + id + '"]')?.focus();
}
async function sectionDeleted() {
  const table = deletingSection.value;
  if (!table) return;
  deletingSection.value = null;
  await registry.refreshAfterStructureChange(table.id);
  if (route.name === 'section' && Number(route.params.id) === table.id) {
    const parent = registry.collections.find(item => item.id === table.collectionId);
    await router.replace(parent ? { name: 'collection', params: { id: parent.id } } : { name: 'home' });
  }
}
async function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) {
    await nextTick();
    const navigation = sidebar.value?.querySelector('nav');
    const current = navigation?.querySelector<HTMLElement>('a[aria-current="page"]');
    const link = current?.getClientRects().length ? current : navigation?.querySelector<HTMLElement>('a');
    link?.focus();
  }
}
function dismissOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && menuOpen.value) {
    closeMenu();
    menuButton.value?.focus();
  }
}
function dismissOutside(event: Event) {
  if (menuOpen.value && !sidebar.value?.contains(event.target as Node)) closeMenu();
}
watch(() => route.fullPath, closeMenu);
onMounted(() => {
  registry.refreshTables();
  document.addEventListener('pointerdown', dismissOutside);
  document.addEventListener('focusin', dismissOutside);
  compact.addEventListener('change', closeMenu);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissOutside);
  document.removeEventListener('focusin', dismissOutside);
  compact.removeEventListener('change', closeMenu);
});
</script>

<template>
  <aside ref="sidebar" class="sidebar" :class="{ 'menu-open': menuOpen }" @keydown="dismissOnEscape">
    <header class="sidebar-head">
      <div class="brand"><span class="app-mark"><Archive :size="21" :stroke-width="1.85" aria-hidden="true" /></span><span>Inventory</span></div>
      <button ref="menuButton" type="button" class="navigation-toggle icon-button" data-action="toggle-navigation"
        aria-label="Навигация" aria-controls="sidebar-nav" :aria-expanded="menuOpen" @click="toggleMenu">
        <PanelLeft :size="18" aria-hidden="true" />
      </button>
    </header>
    <nav id="sidebar-nav" class="sidebar-nav" aria-label="Основная навигация">
      <RouterLink :to="{ name: 'home' }" class="nav-item library-link" @click="showAllRecords($event); closeMenu()">
        <LayoutGrid :size="16" aria-hidden="true" /><span>Все разделы</span>
      </RouterLink>
      <LibraryNavigation @navigate="closeMenu" @create-collection="openCollectionEditor" @delete-section="requestDeletion" />
      <div class="nav-utilities">
        <RouterLink v-for="link in links" :key="link.name" class="nav-item" :to="{ name: link.name }" @click="closeMenu">
          <component :is="link.icon" :size="16" aria-hidden="true" /><span>{{ link.label }}</span>
        </RouterLink>
      </div>
    </nav>
    <CollectionEditor v-if="creatingCollection" :tables="registry.tables" :collections="registry.collections"
      @close="closeCollectionEditor" @saved="collectionSaved" />
    <SectionEditor v-if="deletingSection" :table="deletingSection" :collections="registry.collections" delete-only
      @close="cancelDeletion" @deleted="sectionDeleted" />
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative; z-index: 5; display: flex; flex-direction: column; min-width: 0; min-height: 0;
  border-inline-end: 1px solid var(--line);
  background: linear-gradient(155deg, color-mix(in srgb, var(--sidebar) 90%, var(--accent)) 0, var(--sidebar) 39%);
}
.sidebar-head { display: flex; align-items: center; justify-content: space-between; padding: 24px 17px 21px; }
.brand { display: flex; align-items: center; gap: 10px; color: var(--text); font-size: 1.2857rem; font-weight: 670; letter-spacing: -.045em; line-height: 1; }
.app-mark {
  display: grid; place-items: center; width: 33px; height: 33px; color: white; border-radius: 10px;
  background: linear-gradient(150deg, #71baff, #2479e5 56%, #215dc2);
  box-shadow: inset 0 1px 1px #fff9, inset 0 -1px 1px #103d9855, 0 2px 4px #264c811e;
}
.sidebar-head .navigation-toggle { display: none; }
.sidebar-nav { padding: 0 10px 12px; display: flex; flex-direction: column; flex: 1; min-height: 0; }
.sidebar-nav :deep(.nav-item) {
  display: flex; align-items: center; gap: 9px; min-width: 0; min-height: 32px; padding: 6px 10px;
  border-radius: 7px; font-size: 0.9286rem; font-weight: 480; line-height: 1.25;
  text-decoration: none; color: var(--text); transition: background-color 140ms var(--ease), color 140ms var(--ease);
}
.sidebar-nav :deep(.nav-item span) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-nav :deep(.nav-item svg) { flex: none; color: var(--accent); stroke-width: 1.75; }
.sidebar-nav :deep(.nav-item:hover) { background: color-mix(in srgb, var(--text) 6%, transparent); }
.sidebar-nav :deep(.nav-item[aria-current="page"]) { background: var(--nav-active-bg); color: var(--nav-active-text); font-weight: 620; }
.sidebar-nav :deep(.nav-item[aria-current="page"] svg) { stroke-width: 2; }
.sidebar-nav :deep(.nav-item:focus-visible) { outline-offset: -2px; }
.nav-utilities { display: grid; gap: 1px; border-top: 1px solid var(--line); padding-top: 8px; margin-top: auto; }
.nav-utilities svg { color: var(--muted); }
@media (max-width: 760px) {
  .sidebar { z-index: 8; border-inline-end: 0; border-bottom: 1px solid var(--line); }
  .sidebar-head { height: 100%; padding: 0 15px; justify-content: flex-start; gap: 12px; }
  .brand { gap: 8px; font-size: 1.0714rem; }
  .app-mark { width: 25px; height: 25px; border-radius: 7px; }
  .app-mark svg { width: 17px; height: 17px; }
  .sidebar-head .navigation-toggle { display: inline-flex; margin-inline-start: auto; }
  .sidebar-nav {
    position: absolute; inset: calc(100% + 5px) 9px auto auto; width: min(270px, calc(100vw - 18px));
    max-height: calc(100dvh - 58px); padding: 8px; border: 1px solid var(--line); border-radius: 12px;
    background: var(--surface); box-shadow: 0 9px 30px #11172828; visibility: hidden; opacity: 0;
    transform: translateY(-4px); transition: opacity 150ms var(--ease), transform 150ms var(--ease), visibility 150ms;
  }
  .menu-open .sidebar-nav { visibility: visible; opacity: 1; transform: none; }
}
</style>
