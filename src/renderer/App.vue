<script setup lang="ts">
import { onMounted, watchEffect } from 'vue';
import Sidebar from './components/Sidebar.vue';
import { useInfoStore } from './stores/infoStore.js';
import { useThemeStore } from './stores/themeStore.js';
import { useAppearanceStore } from './stores/appearanceStore.js';
import { applyAppearance } from './appearance/applyAppearance.js';

const info = useInfoStore();
const theme = useThemeStore();
const appearance = useAppearanceStore();
watchEffect(() => { document.documentElement.dataset.theme = theme.theme; });
watchEffect(() => { applyAppearance(document.documentElement, appearance.appearance); });
onMounted(() => {
  info.load();
  theme.load();
  appearance.load();
});
</script>

<template>
  <div class="app-shell">
    <Sidebar />
    <main class="workspace">
      <RouterView v-slot="{ Component }">
        <component :is="Component" class="workspace-page" />
      </RouterView>
    </main>
  </div>
</template>
