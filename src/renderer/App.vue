<script setup lang="ts">
import { onMounted, watchEffect } from 'vue';
import Sidebar from './components/Sidebar.vue';
import { useInfoStore } from './stores/infoStore.js';
import { useThemeStore } from './stores/themeStore.js';

const info = useInfoStore();
const appearance = useThemeStore();
watchEffect(() => { document.documentElement.dataset.theme = appearance.theme; });
onMounted(() => {
  info.load();
  appearance.load();
});
</script>

<template>
  <div class="app-shell">
    <Sidebar />
    <main class="workspace"><RouterView /></main>
  </div>
</template>
