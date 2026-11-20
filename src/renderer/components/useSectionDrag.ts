import { ref, shallowRef } from 'vue';
import type { TableSchema } from '../registry/catalog';

const sectionFormat = 'application/x-inventory-section';
type Destination = number | 'ungroup' | 'delete';

export function useSectionDrag() {
  const dragged = shallowRef<TableSchema | null>(null);
  const hovered = ref<Destination | null>(null);

  function start(event: DragEvent, table: TableSchema) {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    transfer.clearData();
    transfer.setData(sectionFormat, String(table.id));
    transfer.effectAllowed = 'move';
    dragged.value = table;
  }

  function finish() {
    dragged.value = null;
    hovered.value = null;
  }

  function accepts(event: DragEvent, target: Destination) {
    if (!dragged.value || !event.dataTransfer?.types.includes(sectionFormat)) return false;
    return target === 'delete' || dragged.value.collectionId !== (target === 'ungroup' ? null : target);
  }

  function over(event: DragEvent, target: Destination) {
    if (!accepts(event, target)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    hovered.value = target;
  }

  function leave(event: DragEvent) {
    const region = event.currentTarget as HTMLElement;
    if (event.relatedTarget instanceof Node && region.contains(event.relatedTarget)) return;
    hovered.value = null;
  }

  function take(event: DragEvent, target: Destination) {
    if (!accepts(event, target)) return null;
    event.preventDefault();
    const table = dragged.value;
    const valid = event.dataTransfer!.getData(sectionFormat) === String(table!.id);
    finish();
    return valid ? table : null;
  }

  return { dragged, hovered, start, finish, over, leave, take };
}
