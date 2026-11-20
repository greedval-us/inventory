import assert from 'node:assert/strict';

async function createFixture() {
  const api = window.inventory;
  const section = await api.createTable({ name: 'Комплекты для выдачи', fields: [
    { label: 'Код', type: 'text' }, { label: 'Группа', type: 'text' },
  ] });
  for (const [code, group] of [['K01', 'Кабели'], ['K02', 'Адаптеры'], ['K03', ' кабели '], ['K04', null]]) {
    await api.saveRecord({ tableId: section.id, values: { f_1: code, f_2: group } });
  }
  location.hash = '#/sections/' + section.id;
  return section.id;
}

export async function checkTypeConversion(window, evaluate, waitFor) {
  window.setContentSize(1120, 740);
  const id = await evaluate('(' + createFixture.toString() + ')()');
  const element = s => 'document.querySelector(' + JSON.stringify(s) + ')';
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
  const visibleRows = `Array.from(document.querySelectorAll('.record-grid tbody tr'), tr =>
    Array.from(tr.querySelectorAll('td:not(.row-actions)'), td => td.textContent.trim())
  ).sort((a,b) => a[0].localeCompare(b[0]))`;
  const expectRows = expected => waitFor('JSON.stringify(' + visibleRows + ') === ' + JSON.stringify(JSON.stringify(expected)));
  const closed = () => waitFor('!document.querySelector("dialog[open]")');
  const editedField = 'dialog [data-field-key="f_2"] ';
  const type = editedField + 'select[name=fieldType]';

  await waitFor("document.querySelector('main h1')?.textContent === 'Комплекты для выдачи'");
  await click(action('manage-section'));
  await fill(editedField + '[name=fieldLabel]', 'Категория');
  await fill(type, 'select');
  const preview = editedField + '[data-preview=field-options] li';
  const previewNames = 'Array.from(document.querySelectorAll(' + JSON.stringify(preview) + '), li => li.textContent.trim())';
  await waitFor(previewNames + '.length === 2');
  assert.deepEqual(await evaluate(previewNames), ['Кабели', 'Адаптеры']);
  await fill(editedField + '[name=additionalFieldOptions]', 'Запчасти');
  // A value added after the preview must still be included by the conversion.
  await evaluate("window.inventory.saveRecord({tableId:" + id + ",values:{f_1:'K05',f_2:'Блоки'}})");
  await click(action('save-section'));
  await closed();
  const existing = [['K01', 'Кабели'], ['K02', 'Адаптеры'], ['K03', 'Кабели'], ['K04', '—'], ['K05', 'Блоки']];
  await expectRows(existing);
  await waitFor("document.querySelector('th[data-kind=select]')?.textContent === 'Категория'");

  await fill('select[name=field]', 'Категория');
  await fill('input[name=query]', 'кабел');
  await expectRows([existing[0], existing[2]]);
  await fill('input[name=query]', '');
  await fill('select[name=field]', '');
  await click(action('new-record'));
  const dropdown = 'dialog select[name=f_2]';
  await waitFor('Boolean(' + element(dropdown) + ')');
  const options = await evaluate('Array.from(' + element(dropdown) + '.options, o => o.value)');
  assert.deepEqual(options, ['', 'Кабели', 'Адаптеры', 'Блоки', 'Запчасти']);
  await fill('dialog [name=f_1]', 'K06');
  await fill(dropdown, 'Адаптеры');
  await click(action('save-record'));
  await closed();
  await expectRows([...existing, ['K06', 'Адаптеры']]);
  await fill('input[name=query]', 'K06');
  await expectRows([['K06', 'Адаптеры']]);
  await click(action('edit-record'));
  await waitFor(element(dropdown) + "?.value === 'Адаптеры'");
  await fill(dropdown, 'Блоки');
  await click(action('save-record'));
  await closed();
  await expectRows([['K06', 'Блоки']]);
  await fill('input[name=query]', '');
  const complete = [...existing, ['K06', 'Блоки']];
  await expectRows(complete);

  await click(action('manage-section'));
  await fill(type, 'text');
  await click(action('save-section'));
  await closed();
  await waitFor("document.querySelectorAll('th[data-kind=text]').length === 2");
  await expectRows(complete);
  await click(action('manage-section'));
  await fill(type, 'number');
  await click(action('save-section'));
  await waitFor("Boolean(document.querySelector('dialog [role=alert]')?.textContent.trim())");
  assert.match(await evaluate("document.querySelector('dialog [role=alert]').textContent"), /Категория/);
  await click('dialog [aria-label="Закрыть"]');
  await closed();
  await click(action('manage-section'));
  await waitFor(element(type) + "?.value === 'text'");
  await click('dialog [aria-label="Закрыть"]');
  await closed();
  await expectRows(complete);
}
