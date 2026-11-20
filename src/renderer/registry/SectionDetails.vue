<script setup lang="ts">
import type { Collection } from './catalog';

defineProps<{ collections: Collection[]; editing?: boolean }>();
const name = defineModel<string>('name', { required: true });
const description = defineModel<string>('description', { required: true });
const collectionId = defineModel<number | null>('collectionId', { required: true });
</script>

<template>
  <div class="section-metadata">
    <div class="section-details">
      <label class="control" :class="{ 'section-choice': !editing }">
        Название раздела
        <input v-model="name" :name="editing ? 'sectionName' : 'tableName'" :autofocus="editing"
          :placeholder="editing ? undefined : 'Например, Жёсткие диски'" required />
      </label>
      <label v-if="editing || collections.length" class="control">
        Коллекция
        <select v-model="collectionId" name="collectionId">
          <option :value="null">Без коллекции</option>
          <option v-for="item in collections" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>
    </div>
    <label class="control">
      Описание раздела
      <textarea v-model="description" name="sectionDescription" rows="2" placeholder="Необязательно"></textarea>
    </label>
  </div>
</template>

<style scoped>
.section-metadata { display: grid; gap: 10px; min-width: 0; }
textarea { resize: vertical; max-height: 24vh; }
</style>
