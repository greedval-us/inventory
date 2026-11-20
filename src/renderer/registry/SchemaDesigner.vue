<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { useRegistryStore } from '../stores/registryStore';
import { errorMessage } from './catalog';
import FieldDesigner from './FieldDesigner.vue';
import SectionDetails from './SectionDetails.vue';
import { fieldDraft, fieldDefinitions } from './fieldDraft';

const router = useRouter();
const route = useRoute();
const registry = useRegistryStore();
const name = ref('');
const description = ref('');
const collectionId = ref<number | null>(null);
const initialCollectionId = computed(() => registry.collections.find(item => item.id === Number(route.query.collection))?.id ?? null);
watch(initialCollectionId, id => { collectionId.value = id; }, { immediate: true });
const fields = ref([fieldDraft(1)]);
const error = ref('');
const busy = ref(false);

async function create() {
  if (busy.value) return;
  error.value = '';
  busy.value = true;
  try {
    const table = await getDesktopApi().createTable({
      name: name.value.trim(), description: description.value, collectionId: collectionId.value,
      fields: fieldDefinitions(fields.value),
    });
    await router.push({ name: 'section', params: { id: table.id } });
  } catch (cause) {
    error.value = errorMessage(cause, 'Не удалось создать раздел.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="designer-view form-page">
    <h1>Новый раздел</h1>
    <form class="designer-form preference-group" @submit.prevent="create">
      <div class="form-scroll">
        <fieldset :disabled="busy">
          <SectionDetails v-model:name="name" v-model:description="description" v-model:collection-id="collectionId"
            :collections="registry.collections" />
          <FieldDesigner v-model="fields" />
        </fieldset>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <footer class="sheet-actions">
        <RouterLink class="secondary" :to="initialCollectionId ? { name: 'collection', params: { id: initialCollectionId } } : { name: 'home' }">Отмена</RouterLink>
        <button type="submit" class="primary" :disabled="busy">Создать раздел</button>
      </footer>
    </form>
  </section>
</template>
