<script setup lang="ts">
import { Database } from 'lucide-vue-next';
import InfoState from '../components/InfoState.vue';
</script>

<template>
  <section>
    <h1>Рабочее пространство</h1>
    <div class="panel">
      <Database :size="26" class="section-icon" aria-hidden="true" />
      <h2>Локальная база данных</h2>
      <InfoState>
        <p>Для хранения настроек приложение использует SQLite.</p>
        <RouterLink :to="{ name: 'info' }">Посмотреть расположение файла</RouterLink>
      </InfoState>
    </div>
  </section>
</template>
