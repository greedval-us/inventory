import assert from 'node:assert/strict';

export async function checkCollections(window, evaluate, waitFor) {
  window.setContentSize(1160, 760);
  await waitFor('innerWidth > 1000');
  const element = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
  async function click(selector) {
    const target = element(selector);
    await waitFor(target + ' && !' + target + '.matches(":disabled")');
    await evaluate(target + '.click()');
  }
  const action = name => click('[data-action="' + name + '"]');
  const home = () => click('nav a[href="#/"]');
  const section = id => click('nav a[href="#/sections/' + id + '"]');
  const collection = name => click('nav [data-action="open-collection"][title="' + name + '"]');
  const member = id => 'dialog input[name=tableIds][value="' + id + '"]';
  const closed = () => waitFor('!document.querySelector("dialog[open]")');
  const title = name => waitFor(element('main h1') + '?.textContent.trim() === ' + JSON.stringify(name));
  async function fill(selector, value, event = 'input') {
    const target = element(selector);
    await waitFor('Boolean(' + target + ')');
    await evaluate(target + '.value = ' + JSON.stringify(value) + '; ' + target +
      '.dispatchEvent(new Event(' + JSON.stringify(event) + ', { bubbles: true }))');
  }
  async function groups(...names) {
    const headings = "[...document.querySelectorAll('main [data-section-id] h2')].map(h => h.textContent.trim())";
    await waitFor('JSON.stringify(' + headings + ') === ' + JSON.stringify(JSON.stringify(names)));
  }
  async function createCollection(name, ids) {
    await action('new-collection');
    await fill('dialog [name=collectionName]', name);
    for (const id of ids) await click(member(id));
    await action('save-collection');
    await closed();
    await title(name);
  }

  const disk = 'Жёсткие диски', documentSection = 'Документы', spec = 'Спецификации';
  await home();
  await groups(disk, documentSection, spec);
  const ids = await evaluate("Object.fromEntries([...document.querySelectorAll('main [data-section-id]')].map(s => [s.querySelector('h2').textContent.trim(), s.dataset.sectionId]))");
  await createCollection('Офис', [ids[disk], ids[documentSection]]);
  await groups(disk, documentSection);
  await action('toggle-collection');
  await click('main a[href="#/sections/' + ids[disk] + '"]');
  await title(disk);
  await waitFor(element('nav [data-action="toggle-collection"]') + '?.getAttribute("aria-expanded") === "true"');
  await collection('Офис');
  await groups(disk, documentSection);
  await fill('input[name=query]', 'Позиция 30');
  await waitFor("document.querySelector('main')?.textContent.includes('Совпадений нет')");
  await action('search-all-sections');
  await groups(spec);
  await waitFor("document.querySelector('main tbody')?.textContent.includes('Позиция 30')");
  await fill('input[name=query]', '');
  await groups(disk, documentSection, spec);

  await collection('Офис');
  await action('manage-collection');
  await waitFor(element(member(ids[documentSection])) + '?.checked');
  await click(member(ids[documentSection]));
  await fill('dialog [name=collectionName]', 'Оборудование');
  await action('save-collection');
  await closed();
  await title('Оборудование');
  await groups(disk);

  await createCollection('Архив', [ids[documentSection]]);
  await groups(documentSection);
  const archiveId = await evaluate("location.hash.split('/').pop()");
  const renamed = 'Внешние накопители';
  await section(ids[disk]);
  await title(disk);
  await action('manage-section');
  await fill('dialog [name=sectionName]', renamed);
  await fill('dialog [name=collectionId]', archiveId, 'change');
  await action('save-section');
  await closed();
  await title(renamed);
  await home();
  await groups(renamed, documentSection, spec);
  await fill('input[name=query]', 'внешние накоп');
  await groups(renamed);
  await waitFor("document.querySelector('main tbody')?.textContent.includes('Samsung 870 EVO')");
  await collection('Архив');
  await groups(renamed, documentSection);

  await section(ids[documentSection]);
  await title(documentSection);
  await action('manage-section');
  await action('delete-section');
  await waitFor('Boolean(' + element('dialog .confirm-message') + ')');
  const warning = await evaluate(element('dialog .confirm-message') + '.textContent');
  assert.match(warning, /Документы.*все его записи/);
  await action('cancel-delete');
  await waitFor(element('dialog [name=sectionName]') + '?.value === ' + JSON.stringify(documentSection));
  await action('delete-section');
  await action('confirm-delete-section');
  await closed();
  await waitFor('!' + element('nav a[href="#/sections/' + ids[documentSection] + '"]'));
  await collection('Архив');
  await groups(renamed);
  await action('manage-collection');
  await action('delete-collection');
  await action('confirm-delete-collection');
  await closed();
  await waitFor('!' + element('nav [data-action="open-collection"][title="Архив"]'));
  await home();
  await groups(renamed, spec);
  await fill('input[name=query]', 'Samsung');
  await groups(renamed);
  await waitFor("document.querySelector('main tbody')?.textContent.includes('Samsung 870 EVO')");
  await collection('Оборудование');
  await title('Оборудование');
  await groups();
  await action('new-section');
  await waitFor(element('select[name=collectionId] option:checked') + "?.textContent.trim() === 'Оборудование'");
  await fill('input[name=tableName]', 'Мониторы');
  await fill('input[name=fieldLabel]', 'Диагональ');
  await click('form button[type=submit]');
  await title('Мониторы');
  await collection('Оборудование');
  await groups('Мониторы');
}
