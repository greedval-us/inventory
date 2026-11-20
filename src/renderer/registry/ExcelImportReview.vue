<script setup lang="ts">
import type { ExcelImportBook, ExcelImportReport } from './catalog';
defineProps<{ fields: ExcelImportBook['fields']; report: ExcelImportReport }>();

function columnName(index: number) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + (n - 1) % 26) + name;
  }
  return name;
}
</script>

<template>
  <section v-if="report.issueCount" class="import-problems" data-import-issues>
    <h3 role="alert">Ошибок в листе: {{ report.issueCount }}</h3>
    <p>Исправьте данные в Excel и выберите файл снова.</p>
    <ul>
      <li v-for="(issue, index) in report.issues" :key="index">
        <strong v-if="issue.cell || issue.field">{{ [issue.cell, issue.field].filter(Boolean).join(' · ') }}</strong>
        <span>{{ issue.message }}</span>
      </li>
    </ul>
    <small v-if="report.issueCount > report.issues.length">Показаны первые {{ report.issues.length }} ошибок.</small>
  </section>
  <p v-else-if="report.rowCount" role="status" data-import-count>Записей к добавлению: <strong>{{ report.rowCount }}</strong></p>
  <p v-else role="status">На листе нет строк для добавления.</p>
  <div class="import-grid" tabindex="0" role="region" aria-label="Соответствие столбцов Excel полям раздела">
    <table class="record-grid" data-import-preview>
      <caption class="field-sr-label">Поля раздела и первые строки выбранного листа</caption>
      <thead><tr>
        <th v-for="(field, index) in fields" :key="field.key" scope="col">
          <span class="column-letter" :title="report.sourceHeaders[index]">
            {{ columnName(index) }}<template v-if="report.sourceHeaders[index]"> · {{ report.sourceHeaders[index] }}</template>
          </span>
          <span class="field-label">{{ field.label }}</span>
        </th>
      </tr></thead>
      <tbody><tr v-for="(row, rowIndex) in report.preview" :key="rowIndex">
        <td v-for="(_, colIndex) in fields" :key="colIndex"><span :title="row[colIndex]">{{ row[colIndex] || '—' }}</span></td>
      </tr></tbody>
    </table>
  </div>
</template>

<style scoped>
p, h3 { margin: 0; }
h3 { font-size: 1rem; }
.import-problems { display: grid; gap: 5px; }
.import-problems h3 { color: var(--danger); }
.import-problems p, .import-problems small { color: var(--muted); }
.import-problems ul {
  min-width: 0; max-height: 11rem; margin: 0; padding: 0; overflow: auto; list-style: none;
  border: 1px solid var(--line); border-radius: 8px;
}
.import-problems li { display: grid; gap: 2px; padding: 5px 9px; overflow-wrap: anywhere; }
.import-problems li + li { border-top: 1px solid var(--line); }
.import-problems li strong, .column-letter { font-size: .85rem; color: var(--muted); }
.import-grid { min-width: 0; max-width: 100%; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
.import-grid th, .import-grid td { min-width: 6rem; max-width: 16rem; }
.import-grid td span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.column-letter { display: block; max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
.field-label { color: var(--text); }
</style>
