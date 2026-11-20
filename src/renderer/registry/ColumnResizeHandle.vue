<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH } from '../../shared/columnWidths.js';

const props = defineProps<{ fieldKey: string; label: string; width?: number }>();
const emit = defineEmits<{ preview: [width: number]; commit: [width: number]; cancel: [] }>();
const handle = ref<HTMLElement>();
const measured = ref<number>();
let drag: { id: number; startX: number; startWidth: number } | undefined;

function measure() {
  const header = handle.value?.closest('th');
  return measured.value = header ? Math.round(header.getBoundingClientRect().width) : MIN_COLUMN_WIDTH;
}
function bounded(width: number) {
  return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width)));
}
function start(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || drag) return;
  drag = { id: event.pointerId, startX: event.clientX, startWidth: measure() };
  handle.value?.focus({ preventScroll: true });
  handle.value?.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return;
  const width = bounded(drag.startWidth + event.clientX - drag.startX);
  if (width !== measured.value) {
    measured.value = width;
    emit('preview', width);
  }
}
function release() {
  const id = drag?.id;
  drag = undefined;
  if (id !== undefined && handle.value?.hasPointerCapture(id)) handle.value.releasePointerCapture(id);
}
function finish(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return;
  const { startX, startWidth } = drag;
  release();
  const width = bounded(startWidth + event.clientX - startX);
  if (event.clientX !== startX && width !== startWidth) emit('commit', width);
  else emit('cancel');
}
function cancel(event?: PointerEvent) {
  if (!drag || (event && event.pointerId !== drag.id)) return;
  measured.value = drag.startWidth;
  release();
  emit('cancel');
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && drag) {
    event.preventDefault();
    cancel();
    return;
  }
  if (drag || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
  event.preventDefault();
  const startWidth = measure();
  const step = event.shiftKey ? 1 : 8;
  const width = bounded(startWidth + (event.key === 'ArrowRight' ? step : -step));
  if (width !== startWidth) emit('commit', width);
}
onMounted(measure);
onBeforeUnmount(() => cancel());
</script>

<template>
  <span ref="handle" role="separator" aria-orientation="vertical" tabindex="0" class="column-resize"
    :data-resize-key="fieldKey" :aria-label="'Ширина столбца «' + label + '»'"
    :aria-valuemin="MIN_COLUMN_WIDTH" :aria-valuemax="MAX_COLUMN_WIDTH" :aria-valuenow="bounded(props.width ?? measured ?? MIN_COLUMN_WIDTH)"
    title="Изменить ширину столбца. Перетащите границу или используйте стрелки влево и вправо."
    @focus="measure" @pointerdown.stop.prevent="start" @pointermove="move" @pointerup="finish"
    @pointercancel="cancel" @lostpointercapture="cancel" @click.stop.prevent @keydown="keydown" />
</template>

<style scoped>
.column-resize {
  position: absolute; inset-block: 0; inset-inline-end: 0; width: 9px;
  cursor: col-resize; touch-action: none; user-select: none;
}
.column-resize::after {
  content: ''; position: absolute; inset-block: 22%; inset-inline-end: 1px; width: 1px;
  background: var(--line);
}
.column-resize:hover::after, .column-resize:focus-visible::after, .column-resize:active::after {
  width: 2px; background: var(--accent);
}
.column-resize:focus-visible { outline-offset: -2px; }
</style>
