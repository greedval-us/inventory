<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

defineProps<{ label: string; title: string; count?: string | number }>();
const menu = ref<HTMLDetailsElement>();

function dismissOutside(event: Event) {
  if (menu.value?.open && event.target instanceof Node && !menu.value.contains(event.target)) menu.value.open = false;
}
function dismissOnEscape(event: KeyboardEvent) {
  if (!menu.value?.open) return;
  event.preventDefault();
  event.stopPropagation();
  menu.value.open = false;
  menu.value.querySelector('summary')?.focus();
}
function closeSiblingMenus() {
  const current = menu.value;
  if (!current || current.open || 'name' in HTMLDetailsElement.prototype) return;
  for (const sibling of current.parentElement?.querySelectorAll<HTMLDetailsElement>('details[name="registry-scope-filter"][open]') ?? []) {
    sibling.open = false;
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', dismissOutside);
  document.addEventListener('focusin', dismissOutside);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissOutside);
  document.removeEventListener('focusin', dismissOutside);
});
</script>

<template>
  <details ref="menu" name="registry-scope-filter" class="scope-filter" @keydown.esc="dismissOnEscape">
    <summary :title="title" @click="closeSiblingMenus">
      <slot name="icon" />{{ label }}
      <span v-if="count" class="filter-count">{{ count }}</span>
      <ChevronDown class="filter-chevron" :size="13" aria-hidden="true" />
    </summary>
    <div class="scope-filter-body">
      <div class="scope-filter-heading">
        <strong>{{ title }}</strong>
        <slot name="reset" />
      </div>
      <div class="scope-options"><slot /></div>
    </div>
  </details>
</template>
