import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { dialog } from 'electron';

const diskCount = 56;
const control = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
const action = name => '[data-action="' + name + '"]';

async function createFixture(count) {
  const api = window.inventory;
  const collection = await api.saveCollection({ name: 'Экспорт реестра', tableIds: [] });
  const disks = await api.createTable({ name: 'Экспорт — диски', collectionId: collection.id, fields: [
    { label: 'Модель', type: 'text' }, { label: 'Партия', type: 'text' }, { label: 'Остаток', type: 'number' },
  ] });
  const docs = await api.createTable({ name: 'Экспорт — документы', collectionId: collection.id, fields: [
    { label: 'Название', type: 'text' }, { label: 'Архив', type: 'checkbox' },
  ] });
  for (let i = 1; i <= count; i++) {
    const batch = i === 1 || i === count ? 'Q245' : 'Z';
    await api.saveRecord({ tableId: disks.id, values: { f_1: 'Диск ' + i, f_2: batch, f_3: i } });
  }
  await api.saveRecord({ tableId: docs.id, values: { f_1: 'Акт 245', f_2: true } });
  return { collection, disks, docs };
}

export async function checkExcelExport(window, evaluate, waitFor, profile) {
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()));
  const directory = mkdtempSync(join(profile, 'excel-'));
  const { default: ExcelJS } = await import('exceljs');
  const readBook = async file => new ExcelJS.Workbook().xlsx.readFile(file);
  const { collection, disks, docs } = await evaluate('(' + createFixture + ')(' + diskCount + ')');
  const confirm = action('confirm-export-excel');
  async function click(selector) {
    await waitFor(control(selector) + '?.matches(":enabled")');
    await evaluate(control(selector) + '.click()');
  }
  async function change(selector, value, eventType) {
    await waitFor('Boolean(' + control(selector) + ')');
    await evaluate('(() => {const el=' + control(selector) + '; el.value=' + JSON.stringify(value)
      + '; el.dispatchEvent(new Event(' + JSON.stringify(eventType) + ', {bubbles:true}));})()');
  }
  const mode = value => 'input[name=exportMode][value="' + value + '"]';
  const docsChoice = 'input[name=exportSection][value="' + docs.id + '"]';
  const toggleColumns = action('toggle-export-columns') + '[data-table-id="' + disks.id + '"]';
  const batchColumn = 'input[name=exportColumn][data-table-id="' + disks.id + '"][value="f_2"]';

  // Only the native save picker is replaced. The renderer, SQLite query and XLSX writer stay in the loop.
  const originalPicker = dialog.showSaveDialog;
  let destination;
  let pickerCalls = 0;
  dialog.showSaveDialog = async (parent, options) => {
    assert.equal(parent, window);
    assert.ok(options.filters.some(filter => filter.extensions.includes('xlsx')));
    assert.notEqual(destination, undefined, 'Unexpected Excel save dialog');
    pickerCalls++;
    return { canceled: destination === null, filePath: destination ?? '' };
  };
  async function save(file) {
    const expected = pickerCalls + 1;
    destination = file;
    await click(confirm);
    if (file) await waitFor('!' + control(confirm));
    else await waitFor(control(confirm) + '?.matches(":enabled")');
    assert.equal(pickerCalls, expected);
    destination = undefined;
  }

  try {
    await evaluate('location.hash = ' + JSON.stringify('#/collections/' + collection.id));
    const rows = 'document.querySelectorAll(' + JSON.stringify('[data-section-id="' + disks.id + '"] tbody tr') + ').length';
    await waitFor(rows + ' > 0 && ' + rows + ' < ' + diskCount);
    await change('main input[name=query]', 'Q24', 'input');
    await change('main select[name=field]', 'Партия', 'change');
    await evaluate(control(action('section-filter') + ' summary') + '.click()');
    await click('input[name=visibleSection][value="' + docs.id + '"]');
    await click(action('export-excel'));
    await waitFor(control(mode('filtered')) + '?.checked');
    assert.equal(await evaluate(control('[name=exportQuery]') + '.value'), 'Q24');
    assert.equal(await evaluate(control('[name=exportField]') + '.value'), 'Партия');
    assert.equal(await evaluate(control(docsChoice) + '.checked'), false);

    // Reinclude the second section. It has a matching title, but lacks the selected search field.
    await click(docsChoice);
    await change('[name=exportQuery]', '245', 'input');
    await click(toggleColumns);
    await click(batchColumn);
    await save(null);
    assert.deepEqual(readdirSync(directory), []);
    assert.equal(await evaluate(control(batchColumn) + '.checked'), false);
    await click(mode('all'));
    assert.equal(await evaluate(control(batchColumn) + '.checked'), false, 'Column choice survives a mode change');
    await click(mode('filtered'));
    const filteredFile = join(directory, 'По фильтру.xlsx');
    await save(filteredFile);
    const filtered = await readBook(filteredFile);
    assert.deepEqual(filtered.worksheets.map(sheet => sheet.name), [disks.name]);
    assert.deepEqual(filtered.worksheets[0].getSheetValues().slice(1).map(row => row.slice(1)), [
      ['Модель', 'Остаток'], ['Диск ' + diskCount, diskCount], ['Диск 1', 1],
    ]);

    // Opening the dialog again starts from the registry filters. Full mode restores both sections.
    await click(action('export-excel'));
    await click(mode('all'));
    assert.equal(await evaluate(control(docsChoice) + '.checked'), true);
    const fullFile = join(directory, 'Вся коллекция.xlsx');
    await save(fullFile);
    const full = await readBook(fullFile);
    assert.deepEqual(full.worksheets.map(sheet => sheet.name), [disks.name, docs.name]);
    const diskRows = full.worksheets[0].getSheetValues().slice(1).map(row => row.slice(1));
    assert.deepEqual(diskRows.shift(), ['Модель', 'Партия', 'Остаток']);
    assert.equal(diskRows.length, diskCount);
    assert.deepEqual(diskRows[0], ['Диск ' + diskCount, 'Q245', diskCount]);
    assert.deepEqual(diskRows.at(-1), ['Диск 1', 'Q245', 1]);
    assert.deepEqual(full.worksheets[1].getSheetValues().slice(1).map(row => row.slice(1)), [
      ['Название', 'Архив'], ['Акт 245', true],
    ]);
  } finally {
    dialog.showSaveDialog = originalPicker;
  }
}
