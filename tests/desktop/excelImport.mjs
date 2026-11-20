import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { dialog } from 'electron';

const element = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
const action = name => '[data-action="' + name + '"]';

async function prepareSection() {
  const api = window.inventory;
  const table = await api.createTable({ name: 'Приёмка из Excel', fields: [
    { label: 'Количество', type: 'number', required: true },
    { label: 'Модель', type: 'text', required: true },
    { label: 'Состояние', type: 'select', options: ['Новое', 'Б/у'] },
  ] });
  await api.saveRecord({ tableId: table.id, values: { f_1: 8, f_2: 'Старая запись', f_3: 'Б/у' } });
  await api.updateTable({ id: table.id, fields: [table.fields[1], table.fields[0], table.fields[2]] });
  location.hash = '#/sections/' + table.id;
  return table.id;
}

export async function checkExcelImport(window, evaluate, waitFor, profile) {
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()));
  const path = join(mkdtempSync(join(profile, 'excel-import-')), 'Поставка.xlsx');
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const titles = ['Артикул поставщика', 'Штук в коробке', 'Оценка'];
  workbook.addWorksheet('С ошибкой').addRows([titles, ['Диск', 42, 'Новое'], ['Кабель', 'целая коробка', 'Б/у']]);
  workbook.addWorksheet('Не хватает столбца').addRows([titles.slice(0, 2), ['Диск', 42]]);
  workbook.addWorksheet('С заголовками').addRows([titles, ['Крепление', 1, 'Б/у'], ['Винт', 32, 'Новое']]);
  workbook.addWorksheet('Без заголовков').addRows([['Камера Артикул-245', 2, 'Новое'], ['Штатив', 17, 'Б/у']]);
  await workbook.xlsx.writeFile(path);

  const id = await evaluate('(' + prepareSection + ')()');
  const readRows = () => evaluate('window.inventory.searchRecords({tableId:' + id + '})');
  const confirm = action('confirm-import-excel');
  const open = action('import-excel');
  const hasHeader = '[name=importHeader]';
  const issues = element('[data-import-issues]');
  const count = element('[data-import-count] strong');
  const cancel = 'dialog.import-dialog .sheet-close';
  async function click(selector) {
    const target = element(selector);
    await waitFor(target + '?.matches(":enabled")');
    await evaluate(target + '.click()');
  }
  async function change(selector, value, event) {
    const target = element(selector);
    await evaluate(target + '.value = ' + JSON.stringify(value) + '; ' + target +
      '.dispatchEvent(new Event(' + JSON.stringify(event) + ', {bubbles:true}))');
  }
  const sheet = name => change('[name=importSheet]', name, 'change');
  const expectCount = n => waitFor(count + '?.textContent.trim() === "' + n + '" && ' + element(confirm) + '?.matches(":enabled")');
  let chosen;
  const originalPicker = dialog.showOpenDialog;
  dialog.showOpenDialog = async (parent, options) => {
    assert.equal(parent, window);
    assert.ok(options.filters.some(filter => filter.extensions.includes('xlsx')));
    assert.equal(chosen, path, 'Unexpected file picker');
    chosen = undefined;
    return { canceled: false, filePaths: [path] };
  };
  async function choose() {
    chosen = path;
    await click(open);
    await waitFor(issues + '?.textContent.includes("B3") && ' + issues + '.textContent.includes("Количество")');
    assert.equal(chosen, undefined);
    assert.equal(await evaluate(element(confirm) + '.disabled'), true);
  }
  try {
    await waitFor('document.querySelector("tbody")?.textContent.includes("Старая запись")');
    window.setContentSize(640, 480);
    await choose();
    assert.equal((await readRows()).total, 1, 'An invalid sheet must not append its preceding valid row');
    await sheet('Не хватает столбца');
    await waitFor(issues + ' && !' + issues + '.textContent.includes("B3") && ' + element(confirm) + '.disabled');
    await sheet('С заголовками');
    await expectCount(2);
    const columnLabels = selector => evaluate('[...document.querySelectorAll(' +
      JSON.stringify('[data-import-preview] th ' + selector) + ')].map(span => span.textContent.trim())');
    assert.deepEqual(await columnLabels('.field-label'), ['Модель', 'Количество', 'Состояние']);
    assert.deepEqual(await columnLabels('.column-letter'), ['A · ' + titles[0], 'B · ' + titles[1], 'C · ' + titles[2]]);
    await click(hasHeader);
    await waitFor(issues + '?.textContent.includes("B1") && ' + element(confirm) + '.disabled');
    await click(hasHeader);
    await expectCount(2);
    await click(cancel);
    await waitFor('!' + element(cancel));
    assert.equal((await readRows()).total, 1, 'Cancelling a valid preview must leave existing rows unchanged');
    await choose();
    await sheet('Без заголовков');
    await expectCount(1);
    await click(hasHeader);
    await expectCount(2);
    assert.equal((await readRows()).total, 1, 'Nothing is written until confirmation');
    assert.deepEqual(await columnLabels('.column-letter'), ['A', 'B', 'C']);
    await waitFor(`(() => {
      const dialog = document.querySelector('dialog.import-dialog');
      const button = dialog?.querySelector('[type=submit]');
      if (!button || dialog.scrollWidth > dialog.clientWidth + 1) return false;
      const box = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })()`);
    await click(confirm);
    await waitFor(element('.registry-notice') + '?.textContent.includes("Добавлено записей: 2")');
    const result = await readRows();
    assert.equal(result.total, 3);
    assert.deepEqual(result.rows.map(row => row.values), [
      { f_1: 17, f_2: 'Штатив', f_3: 'Б/у' }, { f_1: 2, f_2: 'Камера Артикул-245', f_3: 'Новое' },
      { f_1: 8, f_2: 'Старая запись', f_3: 'Б/у' },
    ]);
    await change('main input[name=query]', '245', 'input');
    await waitFor('document.querySelectorAll("tbody tr").length === 1 && document.querySelector("tbody")?.textContent.includes("Камера Артикул-245")');
  } finally {
    dialog.showOpenDialog = originalPicker;
  }
}
