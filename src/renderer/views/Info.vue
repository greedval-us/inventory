<script setup lang="ts">
import InfoState from '../components/InfoState.vue';
</script>

<template>
  <section>
    <h1>О приложении</h1>
    <div class="panel">
      <InfoState v-slot="{ info }">
        <h2>{{ info.name }}</h2>
        <dl>
          <div><dt>Версия</dt><dd>{{ info.version }}</dd></div>
          <div><dt>Файл базы данных</dt><dd class="path">{{ info.databasePath }}</dd></div>
        </dl>
      </InfoState>
    </div>
  </section>
</template>

<style scoped>
dl { margin: 20px 0 0; }
dl > div {
  display: grid;
  grid-template-columns: minmax(100px, 140px) 1fr;
  gap: 16px;
  padding-block: 12px;
  border-top: 1px solid var(--line);
}
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.path { font-family: Consolas, monospace; font-size: 0.93rem; }
@media (max-width: 480px) { dl > div { grid-template-columns: 1fr; gap: 4px; } }
</style>
