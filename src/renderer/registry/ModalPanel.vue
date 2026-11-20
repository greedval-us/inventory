<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { X } from 'lucide-vue-next';

const props = defineProps<{ title: string; busy: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const closing = ref(false);
onMounted(() => dialog.value?.showModal());
onBeforeUnmount(() => { if (dialog.value?.open) dialog.value.close(); });

async function finish() {
  const sheet = dialog.value;
  if (!sheet?.open || closing.value) return;
  closing.value = true;
  await nextTick();
  if (!document.hidden) {
    await Promise.allSettled(sheet.getAnimations().map(animation => animation.finished));
  }
  if (sheet.open) sheet.close();
}

async function cancel() {
  if (props.busy || closing.value) return;
  await finish();
  emit('close');
}

defineExpose({ finish });
</script>

<template>
  <dialog ref="dialog" class="record-dialog" aria-labelledby="modal-title" :data-closing="closing || undefined"
    :inert="closing" @cancel.prevent="cancel">
    <header class="sheet-heading">
      <h2 id="modal-title">{{ title }}</h2>
      <button type="button" class="icon-button sheet-close" aria-label="Закрыть" :disabled="busy" @click="cancel"><X :size="15" /></button>
    </header>
    <slot :cancel="cancel" />
  </dialog>
</template>
