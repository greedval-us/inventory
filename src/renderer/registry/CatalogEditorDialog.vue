<script setup lang="ts" generic="Result">
import { computed, nextTick, onMounted, ref } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import ModalPanel from './ModalPanel.vue';
import { errorMessage } from './catalog';

const props = defineProps<{
  kind: 'section' | 'collection';
  title: string;
  valid: boolean;
  save: () => Promise<Result>;
  validate?: () => void;
  remove?: () => Promise<unknown>;
  deleteOnly?: boolean;
  removedFieldNames?: string[];
  removedOptions?: { field: string; labels: string[] }[];
  deleteLabel: string;
  deleteMessage: string;
  saveLabel?: string;
}>();
const emit = defineEmits<{ close: []; saved: [result: Result]; deleted: [] }>();
const panel = ref<InstanceType<typeof ModalPanel>>();
const deleteButton = ref<HTMLButtonElement>();
const saveButton = ref<HTMLButtonElement>();
const backButton = ref<HTMLButtonElement>();
type Confirmation = 'entity' | 'fields';
const confirming = ref<Confirmation | null>(props.deleteOnly ? 'entity' : null);
const confirmationTitle = computed(() => {
  if (confirming.value === 'entity') return props.deleteLabel + '?';
  if (props.removedFieldNames?.length && props.removedOptions?.length) return 'Удалить выбранные поля и варианты?';
  return props.removedFieldNames?.length ? 'Удалить выбранные поля?' : 'Удалить варианты списка?';
});
const confirmAction = computed(() => confirming.value === 'entity' ? 'confirm-delete-' + props.kind
  : props.removedFieldNames?.length ? 'confirm-remove-fields' : 'confirm-remove-options');
const busy = ref(false);
const error = ref('');

onMounted(() => { if (props.deleteOnly) backButton.value?.focus(); });

async function confirmDeletion(mode: Confirmation | null) {
  const trigger = confirming.value === 'fields' ? saveButton : deleteButton;
  error.value = '';
  confirming.value = mode;
  await nextTick();
  (mode ? backButton : trigger).value?.focus();
}

async function submit() {
  if (busy.value || (!confirming.value && !props.valid)) return;
  error.value = '';
  try {
    if (!confirming.value && (props.removedFieldNames?.length || props.removedOptions?.length)) {
      props.validate?.();
      await confirmDeletion('fields');
      return;
    }
    busy.value = true;
    if (confirming.value === 'entity' && props.remove) {
      await props.remove();
      await panel.value?.finish();
      emit('deleted');
    } else {
      const result = await props.save();
      await panel.value?.finish();
      emit('saved', result);
    }
  } catch (cause) {
    error.value = errorMessage(cause, confirming.value === 'entity' ? 'Не удалось выполнить удаление.' : 'Не удалось сохранить изменения.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <ModalPanel ref="panel" v-slot="{ cancel }" class="catalog-dialog"
    :title="confirming ? confirmationTitle : title" :busy="busy" @close="emit('close')">
    <form class="record-form" @submit.prevent="submit">
      <div v-if="confirming" class="form-scroll confirm-message">
        <template v-if="confirming === 'fields'">
          <template v-if="removedFieldNames?.length">
            <p>Значения этих полей будут удалены из всех записей раздела.</p>
            <ul><li v-for="fieldName in removedFieldNames" :key="fieldName">{{ fieldName }}</li></ul>
          </template>
          <p v-for="item in removedOptions" :key="item.field" class="removed-options">
            В записях, где выбран один из вариантов {{ item.labels.map(label => '«' + label + '»').join(', ') }},
            поле «{{ item.field }}» станет пустым.
          </p>
        </template>
        <p v-else>{{ deleteMessage }}</p>
      </div>
      <div v-else class="form-scroll">
        <fieldset class="catalog-fields" :disabled="busy" @input="error = ''" @change="error = ''"><slot /></fieldset>
      </div>
      <p v-if="error" role="alert" class="form-error">{{ error }}</p>
      <footer v-if="confirming" class="sheet-actions">
        <button ref="backButton" type="button" class="secondary" data-action="cancel-delete" :disabled="busy"
          @click="deleteOnly ? cancel() : confirmDeletion(null)">Отмена</button>
        <button type="submit" class="danger" :data-action="confirmAction" :disabled="busy">
          {{ confirming === 'fields' ? 'Удалить и сохранить' : deleteLabel }}
        </button>
      </footer>
      <footer v-else class="sheet-actions">
        <button v-if="remove" ref="deleteButton" type="button" class="secondary catalog-remove" :data-action="'delete-' + kind"
          :aria-label="deleteLabel" :title="deleteLabel" :disabled="busy" @click="confirmDeletion('entity')">
          <Trash2 :size="14" aria-hidden="true" />Удалить
        </button>
        <button type="button" class="secondary" :disabled="busy" @click="cancel">Отмена</button>
        <button ref="saveButton" type="submit" class="primary" :data-action="'save-' + kind" :disabled="!valid || busy">{{ saveLabel || 'Сохранить' }}</button>
      </footer>
    </form>
  </ModalPanel>
</template>

<style scoped>
.catalog-dialog { width: min(460px, calc(100% - 28px)); }
.catalog-dialog.section-editor-dialog { width: min(600px, calc(100% - 28px)); }
.catalog-fields { display: grid; gap: 14px; }
.catalog-remove { margin-inline-end: auto; color: var(--danger); }
.confirm-message :not(:first-child).removed-options { margin-top: 10px; }
</style>
