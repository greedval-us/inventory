import assert from 'node:assert/strict';

export async function checkSchemaEditing(window, evaluate, waitFor) {
  window.setContentSize(1000, 700);
  const id = await evaluate(`(async () => {
    const table = await window.inventory.createTable({ name: 'Фотооборудование', fields: [
      { label: 'Модель', type: 'text' }, { label: 'Кабинет', type: 'number' },
      { label: 'Пометка', type: 'text' }, { label: 'Проверен', type: 'checkbox' },
    ] });
    await window.inventory.saveRecord({ tableId: table.id, values: {
      f_1: 'Штатив 245', f_2: 20, f_3: 'Снять-883', f_4: true,
    } });
    location.hash = '#/sections/' + table.id;
    return table.id;
  })()`);
  const element = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
  const action = name => '[data-action="' + name + '"]';
  const field = key => 'dialog [data-field-key="' + key + '"] ';
  async function click(selector) {
    const target = element(selector);
    await waitFor(target + ' && !' + target + '.matches(":disabled")');
    await evaluate(target + '.click()');
  }
  async function fill(selector, value, event = 'input') {
    const target = element(selector);
    await waitFor('Boolean(' + target + ')');
    await evaluate(target + '.value = ' + JSON.stringify(value) + '; ' + target +
      '.dispatchEvent(new Event(' + JSON.stringify(event) + ', {bubbles: true}))');
  }
  const displayedRow = "Array.from(document.querySelectorAll('tbody tr:first-child td:not(.row-actions)'), cell => cell.textContent.trim())";
  await waitFor("document.querySelector('tbody')?.textContent.includes('Штатив 245')");
  await fill('select[name=field]', 'Модель', 'change');
  await fill('input[name=query]', '245');
  window.setContentSize(640, 480);
  await waitFor('Math.abs(innerWidth - 640) <= 1 && Math.abs(innerHeight - 480) <= 1');
  await click(action('manage-section'));
  await waitFor(`(() => {
    const dialog = document.querySelector('dialog[open]');
    const button = dialog?.querySelector('[data-action="save-section"]');
    if (!button || dialog.scrollWidth > dialog.clientWidth + 1) return false;
    const box = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })()`);
  await fill(field('f_1') + '[name=fieldLabel]', 'Наименование');
  await click(field('f_2') + action('move-field-up'));
  await click(field('f_3') + action('remove-field'));
  await click('dialog ' + action('add-field'));
  await fill('dialog .designer-row:last-child [name=fieldLabel]', 'Состояние');
  await fill('dialog .designer-row:last-child [name=fieldType]', 'select', 'change');
  await fill('dialog [name=fieldOptions]', 'Выдан\nВ наличии');
  await click(action('save-section'));
  await waitFor("document.querySelector('dialog .confirm-message')?.textContent.includes('Пометка')");
  const storedLabels = await evaluate('window.inventory.listTables().then(tables => tables.find(t => t.id === ' + id + ').fields.map(f => f.label))');
  assert.deepEqual(storedLabels, ['Модель', 'Кабинет', 'Пометка', 'Проверен']);
  await click(action('cancel-delete'));
  await click(action('save-section'));
  await click(action('confirm-remove-fields'));
  await waitFor("document.querySelectorAll('dialog[open]').length === 0 && document.querySelector('select[name=field]')?.value === 'Наименование'");
  assert.equal(await evaluate(element('input[name=query]') + '.value'), '245');
  const headings = await evaluate("Array.from(document.querySelectorAll('thead th'), cell => cell.textContent.trim())");
  assert.deepEqual(headings, ['Кабинет', 'Наименование', 'Проверен', 'Состояние', 'Действия']);
  await waitFor(displayedRow + ".join('|') === '20|Штатив 245|Да|—'");

  await click(action('edit-record'));
  const dropdown = 'dialog .record-fields select';
  await fill(dropdown, 'Выдан', 'change');
  await click(action('save-record'));
  await waitFor(displayedRow + ".join('|') === '20|Штатив 245|Да|Выдан'");
  await click(action('toggle-navigation'));
  await click('nav a[href="#/"]');
  await fill('input[name=query]', 'Снять-883');
  await waitFor("document.querySelector('main')?.textContent.includes('Совпадений нет')");
  await fill('input[name=query]', 'Штатив');
  await waitFor(element('[data-section-id="' + id + '"] tbody') + "?.textContent.includes('Штатив 245')");
}
