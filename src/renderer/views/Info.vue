<script setup lang="ts">
import { Archive } from 'lucide-vue-next';
import InfoState from '../components/InfoState.vue';
</script>

<template>
  <section class="form-page preferences-view">
    <h1>О приложении</h1>
    <div class="preference-group info-pane">
      <InfoState v-slot="{ info }">
        <div class="product-heading">
          <span class="product-mark" aria-hidden="true"><Archive :size="24" :stroke-width="1.75" /></span>
          <h2>{{ info.name }}</h2>
        </div>
        <dl>
          <div><dt>Версия</dt><dd>{{ info.version }}</dd></div>
          <div><dt>Файл базы данных</dt><dd class="path">{{ info.databasePath }}</dd></div>
        </dl>
      </InfoState>
    </div>
  </section>
</template>

<style scoped>
.product-heading { display: flex; align-items: center; gap: 12px; }
.product-heading h2 { margin: 0; font-size: 1.3571rem; letter-spacing: -.035em; }
.product-mark {
  display: grid; place-content: center; width: 42px; height: 42px; border-radius: 12px;
  background: linear-gradient(155deg, #6aaafa, #3178da 60%, #215cb3); color: white;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .44), 0 2px 5px rgb(30 85 150 / .18);
}
dl { margin: 14px 0 0; font-size: 0.9286rem; }
dl > div {
  display: grid;
  grid-template-columns: minmax(100px, 130px) minmax(0, 1fr);
  gap: 12px;
  padding-block: 9px;
  border-top: 1px solid var(--line);
}
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.path { user-select: text; }
@media (max-width: 480px) { dl > div { grid-template-columns: 1fr; gap: 4px; } }
</style>
