<script setup lang="ts">
import { useInfoStore } from '../stores/infoStore.js';
const store = useInfoStore();
</script>

<template>
  <p v-if="store.loading" role="status">Загрузка сведений…</p>
  <div v-else-if="store.error">
    <p role="alert">{{ store.error }}</p>
    <button type="button" @click="store.load">Повторить</button>
  </div>
  <slot v-else-if="store.info" :info="store.info" />
</template>
