<script setup lang="ts">
import { Archive, House, Info, Settings } from 'lucide-vue-next';

const links = [
  { name: 'home', label: 'Главная', icon: House },
  { name: 'settings', label: 'Настройки', icon: Settings },
  { name: 'info', label: 'О приложении', icon: Info },
];
</script>

<template>
  <aside class="sidebar">
    <div class="brand"><Archive :size="24" aria-hidden="true" /><span>Inventory</span></div>
    <nav aria-label="Основная навигация">
      <RouterLink v-for="link in links" :key="link.name" :to="{ name: link.name }">
        <component :is="link.icon" :size="18" aria-hidden="true" />
        {{ link.label }}
      </RouterLink>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  padding: 28px 16px;
  background: var(--surface);
  border-inline-end: 1px solid var(--line);
}
.brand, nav a { display: flex; align-items: center; gap: 12px; }
.brand { margin: 0 12px 38px; font-size: 1.32rem; font-weight: 650; }
.brand svg { color: var(--accent); }
nav { display: grid; gap: 4px; }
nav a {
  border-radius: 6px;
  color: var(--muted);
  font-size: 0.94rem;
  padding: 10px 12px;
  text-decoration: none;
}
nav a:hover { background: var(--canvas); color: var(--text); }
nav a[aria-current="page"] { background: var(--tint); color: var(--accent); font-weight: 600; }
@media (max-width: 680px) {
  .sidebar { border: 0; border-bottom: 1px solid var(--line); padding: 16px; }
  .brand { margin: 0 0 12px; }
  nav { display: flex; flex-wrap: wrap; }
  nav a { padding: 8px; gap: 6px; }
}
</style>
