import assert from 'node:assert/strict';

export async function checkFieldSettings(window, evaluate, waitFor) {
  window.setContentSize(1130, 740);
  const element = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
  const action = name => '[data-action="' + name + '"]';
  async function click(selector) {
    const target = element(selector);
    await waitFor(target + ' && !' + target + '.matches(":disabled")');
    await evaluate(target + '.click()');
  }
  async function fill(selector, value) {
    const target = element(selector);
    await waitFor('Boolean(' + target + ')');
    await evaluate(`(() => {
      const control = ${target};
      control.value = ${JSON.stringify(value)};
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    })()`);
  }
  async function field(index, name, type, required = false) {
    if (index > 1) await click(action('add-field'));
    const row = '[data-field-id="' + index + '"] ';
    await fill(row + '[name=fieldLabel]', name);
    await fill(row + '[name=fieldType]', type);
    if (required) await click(row + '[name=fieldRequired]');
    return row;
  }
  const closed = () => waitFor('!document.querySelector("dialog[open]")');
  const rows = "Array.from(document.querySelectorAll('tbody tr'), row => Array.from(row.querySelectorAll('td:not(.row-actions)'), cell => cell.textContent.trim()))";
  const hasRow = cells => rows + '.some(row => JSON.stringify(row) === ' + JSON.stringify(JSON.stringify(cells)) + ')';

  await click('nav ' + action('new-section'));
  await fill('[name=tableName]', 'Выдача техники');
  const first = await field(1, 'Предмет', 'text', true);
  await click(first + action('edit-hint'));
  await fill(first + '[name=fieldHint]', 'Введите инвентарный номер');
  const select = await field(2, 'Этап', 'select', true);
  await fill(select + '[name=fieldOptions]', 'Согласован\nНа проверке');
  await field(3, 'Выдан', 'date');
  await field(4, 'Приём', 'datetime');
  await field(5, 'Период', 'month');
  await field(6, 'Оплачен', 'checkbox', true);
  await click('.designer-form button[type=submit]');
  await waitFor("document.querySelector('main h1')?.textContent === 'Выдача техники'");

  const recordField = id => 'dialog [name=f_' + id + ']';
  await click(action('new-record'));
  await click(action('save-record'));
  const missing = await evaluate("Array.from(document.querySelectorAll('dialog [required]')).filter(e => e.validity.valueMissing).map(e => e.name)");
  assert.deepEqual(missing, ['f_1', 'f_2', 'f_6']);
  assert.equal(await evaluate("document.querySelector('dialog .field-hint')?.textContent"), 'Введите инвентарный номер');
  await fill(recordField(1), 'Ноутбук А07');
  await fill(recordField(2), 'Согласован');
  await fill(recordField(3), '2026-11-20');
  await fill(recordField(4), '2026-11-20T09:15');
  await fill(recordField(5), '2026-11');
  await fill(recordField(6), 'false');
  await click(action('save-record'));
  await closed();
  const formatted = ['20.11.2026', '20.11.2026 09:15', '11.2026', 'Нет'];
  await waitFor(hasRow(['Ноутбук А07', 'Согласован', ...formatted]));
  await click(action('new-record'));
  await fill(recordField(1), 'Камера К07');
  await fill(recordField(2), 'На проверке');
  await fill(recordField(6), 'true');
  await click(action('save-record'));
  await closed();
  await waitFor(hasRow(['Камера К07', 'На проверке', '—', '—', '—', 'Да']));

  await click(action('manage-section'));
  const editor = 'dialog [data-field-key=f_2] ';
  await click(editor + action('edit-options'));
  await fill(editor + '[data-option-source="Согласован"] [name=optionLabel]', 'Готов к выдаче');
  await click(editor + action('add-option'));
  await fill(editor + '[data-choice-id]:not([data-option-source]) [name=optionLabel]', 'На хранении');
  await click(editor + '[data-option-source="На проверке"] ' + action('remove-option'));
  await click(action('save-section'));
  await waitFor("document.querySelector('dialog .confirm-message')?.textContent.includes('На проверке')");
  await click(action('confirm-remove-options'));
  await closed();
  await waitFor(hasRow(['Ноутбук А07', 'Готов к выдаче', ...formatted]));
  await waitFor(hasRow(['Камера К07', '—', '—', '—', '—', 'Да']));
  await fill('input[name=query]', 'Согласован');
  await waitFor("document.querySelector('main')?.textContent.includes('Совпадений нет')");
  await fill('input[name=query]', 'готов к выд');
  await waitFor(hasRow(['Ноутбук А07', 'Готов к выдаче', ...formatted]));
  await fill('input[name=query]', 'Камера К07');
  await waitFor(hasRow(['Камера К07', '—', '—', '—', '—', 'Да']));
  await click(action('edit-record'));
  await click(action('save-record'));
  assert.ok(await evaluate(element(recordField(2)) + '.validity.valueMissing'));
  await fill(recordField(2), 'На хранении');
  await click(action('save-record'));
  await closed();
  await waitFor(hasRow(['Камера К07', 'На хранении', '—', '—', '—', 'Да']));
}
