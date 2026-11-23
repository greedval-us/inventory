<script setup lang="ts">
import { onMounted, watchEffect } from 'vue';
import Sidebar from './components/Sidebar.vue';
import { useThemeStore } from './stores/themeStore.js';
import { useAppearanceStore } from './stores/appearanceStore.js';
import { applyAppearance } from './appearance/applyAppearance.js';

const theme = useThemeStore();
const appearance = useAppearanceStore();
watchEffect(() => { document.documentElement.dataset.theme = theme.theme; });
watchEffect(() => { applyAppearance(document.documentElement, appearance.appearance); });
onMounted(() => {
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
