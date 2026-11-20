import assert from 'node:assert/strict';

const sourceName = 'Стенды';
const copyName = sourceName + ' (копия)';
const q = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';

export async function checkCopySection(evaluate, waitFor, phase) {
  const copyButton = q('[data-action="copy-section"]');
  const nameInput = q('dialog[open] input[name=sectionName]');
  const collectionInput = q('dialog[open] select[name=collectionId]');
  async function open(id, name) {
    await evaluate("location.hash = '#/sections/' + " + id);
    await waitFor(q('main h1') + '?.textContent === ' + JSON.stringify(name));
  }
  async function startCopy() {
    await waitFor('Boolean(' + copyButton + ')');
    await evaluate(copyButton + '.click()');
    await waitFor('Boolean(' + nameInput + ')');
  }
  if (phase === 'copySection') {
    const source = await evaluate(`(async () => {
      const api = window.inventory;
      const a = await api.saveCollection({ name: 'Лаборатория', tableIds: [] });
      await api.saveCollection({ name: 'Филиал', tableIds: [] });
      const table = await api.createTable({ name: 'Стенды', collectionId: a.id, fields: [
        { label: 'Статус', type: 'select', options: ['Свободен', 'Занят'], required: true, hint: 'Выберите состояние' },
        { label: 'Проверка', type: 'date' },
      ] });
      await api.saveRecord({ tableId: table.id, values: {f_1: 'Занят'} });
      return table;
    })()`);
    await open(source.id, sourceName);
    await startCopy();
    assert.equal(await evaluate(nameInput + '.value'), copyName);
    assert.equal(await evaluate(collectionInput + '.selectedOptions[0].textContent'), 'Лаборатория');
    await evaluate(q('dialog[open] .sheet-close') + '.click()');
    await waitFor('!' + nameInput);
    assert.ok(!(await evaluate('window.inventory.listTables()')).some(t => t.name === copyName));
    await startCopy();
    await evaluate(`(() => {
      const select = document.querySelector('dialog[open] select[name=collectionId]');
      select.selectedIndex = [...select.options].findIndex(o => o.textContent === 'Филиал');
      select.dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    await evaluate(q('[data-action="confirm-copy-section"]') + '.click()');
    await waitFor(q('main h1') + '?.textContent === ' + JSON.stringify(copyName));
    await waitFor(q('.empty-section') + "?.textContent.includes('Записей пока нет')");
    const copy = (await evaluate('window.inventory.listTables()')).find(t => t.name === copyName);
    assert.deepEqual(copy.fields, source.fields);
    await evaluate(q('[data-action="manage-section"]') + '.click()');
    const copyLabel = q('dialog[open] [data-field-key=f_2] input[name=fieldLabel]');
    await waitFor(copyLabel + '?.value === "Проверка"');
    await evaluate('(() => {const el=' + copyLabel + ';el.value="Проверка филиала";'
      + 'el.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await evaluate(q('dialog[open] [data-action="save-section"]') + '.click()');
    await waitFor(q('main [data-sort-key=f_2]') + '?.textContent.includes("Проверка филиала")');
    await open(source.id, sourceName);
    await startCopy();
    assert.equal(await evaluate(nameInput + '.value'), sourceName + ' (копия 2)');
    await evaluate(q('dialog[open] .sheet-close') + '.click()');
    await waitFor('!' + nameInput);
  }
  const tables = await evaluate('window.inventory.listTables()');
  const original = tables.find(t => t.name === sourceName);
  const copy = tables.find(t => t.name === copyName);
  assert.ok(copy && original && copy.id !== original.id);
  assert.equal(original.fields[1].label, 'Проверка');
  assert.deepEqual(copy.fields, [original.fields[0], { ...original.fields[1], label: 'Проверка филиала' }]);
  const target = (await evaluate('window.inventory.listCollections()')).find(c => c.name === 'Филиал');
  assert.equal(copy.collectionId, target.id);
  assert.equal((await evaluate('window.inventory.searchRecords({tableId:' + original.id + '})')).total, 1);
  await open(copy.id, copyName);
  await waitFor(q('.empty-section') + "?.textContent.includes('Записей пока нет')");
  await waitFor(q('main [data-sort-key=f_2]') + '?.textContent.includes("Проверка филиала")');
  await waitFor(q('nav a[href="#/sections/' + copy.id + '"]') + '?.textContent.includes(' + JSON.stringify(copyName) + ')');
}
