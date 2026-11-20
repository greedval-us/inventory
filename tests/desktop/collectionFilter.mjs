import assert from 'node:assert/strict';

const searchToken = 'CF-245-820';
const queryInput = 'main input[name=query]';
const action = name => '[data-action="' + name + '"]';
const node = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';

async function seed(token) {
  const api = window.inventory;
  const groupA = await api.saveCollection({ name: 'Фильтр — площадка А', tableIds: [] });
  const groupB = await api.saveCollection({ name: 'Фильтр — площадка Б', tableIds: [] });
  const emptyGroup = await api.saveCollection({ name: 'Фильтр — пустая площадка', tableIds: [] });
  const sections = [];
  for (const [label, collectionId, codes] of [
    ['Оборудование А', groupA.id, ['01']], ['Документы А', groupA.id, ['02', '03']],
    ['Оборудование Б', groupB.id, ['только Б']], ['Отдельные объекты', null, ['05']],
  ]) {
    const table = await api.createTable({ name: 'Фильтр — ' + label, collectionId, fields: [{ label: 'Код', type: 'text' }] });
    for (const code of codes) await api.saveRecord({ tableId: table.id, values: { f_1: token + ' ' + code } });
    sections.push(table);
  }
  return { groupA, groupB, emptyGroup, sections };
}

export async function checkCollectionFilter(window, evaluate, waitFor) {
  const { groupA, groupB, emptyGroup, sections } = await evaluate('(' + seed + ')(' + JSON.stringify(searchToken) + ')');
  const [a1, a2, b, free] = sections;
  const allIds = (await evaluate('window.inventory.listTables()')).map(table => table.id);
  const cards = 'Array.from(document.querySelectorAll("main [data-section-id]"), el => Number(el.dataset.sectionId))';
  const expectCards = (...tables) => waitFor(cards + '.join(",") === ' + JSON.stringify(tables.map(t => t.id).join(',')));
  async function click(selector) {
    const el = node(selector);
    await waitFor(el + '?.getClientRects().length && !' + el + '.matches(":disabled")');
    await evaluate(el + '.click()');
  }
  async function menu(name, select) {
    const el = node(action(name));
    if (!await evaluate(el + '.open')) await click(action(name) + ' summary');
    await click(select);
    if (await evaluate(el + '.open')) await click(action(name) + ' summary');
  }
  const selectCollection = id => menu('collection-filter', 'input[name=filterCollection][value="' + id + '"]');
  const hideSection = id => menu('section-filter', 'input[name=visibleSection][value="' + id + '"]');
  async function search(value) {
    await evaluate('(() => { const el=' + node(queryInput) + '; el.value=' + JSON.stringify(value)
      + '; el.dispatchEvent(new Event("input", {bubbles:true})); })()');
  }
  const hiddenCount = count => waitFor('Number(' + node('.hidden-matches span') + '?.textContent.match(/[0-9]+/)?.[0]) === ' + count);
  const checkedForExport = () => evaluate('Array.from(document.querySelectorAll("input[name=exportSection]:checked"), el => Number(el.value))');

  window.setContentSize(640, 480);
  await waitFor('Math.abs(innerWidth - 640) <= 1 && Math.abs(innerHeight - 480) <= 1');
  await evaluate('location.hash = "#/"');
  await waitFor('(() => { const el=' + node(action('collection-filter') + ' summary') + '; if (!el) return false; '
    + 'const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()');
  await selectCollection(emptyGroup.id);
  assert.equal(await evaluate(node(queryInput) + '.value'), '');
  await waitFor(node('.registry-empty h2') + '?.textContent === "В выбранных коллекциях нет разделов"');
  await expectCards();
  await click('.registry-empty button');
  await waitFor(cards + '.length === ' + allIds.length);
  await search(searchToken);
  await expectCards(a1, a2, b, free);

  // The local reset restores only the sections of the selected collections.
  await hideSection(free.id);
  await selectCollection(groupA.id);
  await hideSection(a2.id);
  await expectCards(a1);
  await menu('section-filter', action('show-all-sections'));
  await expectCards(a1, a2);
  await menu('collection-filter', action('all-collections'));
  await expectCards(a1, a2, b);
  await click('.hidden-matches button');
  await expectCards(a1, a2, b, free);

  await selectCollection(groupA.id);
  await expectCards(a1, a2);
  await hiddenCount(2);
  await selectCollection(groupB.id);
  await expectCards(a1, a2, b);
  await hideSection(a2.id);
  await expectCards(a1, b);
  await hiddenCount(3);

  await click(action('export-excel'));
  await waitFor(node('input[name=exportMode][value=filtered]') + '?.checked');
  assert.deepEqual(await checkedForExport(), [a1.id, b.id]);
  await click('input[name=exportMode][value=all]');
  assert.deepEqual(await checkedForExport(), allIds);
  await click('dialog[open] .sheet-close');
  await waitFor('!' + node('dialog[open]'));
  await click('.hidden-matches button');
  await expectCards(a1, a2, b, free);
  assert.equal(await evaluate(node(queryInput) + '.value'), searchToken);

  await selectCollection(groupA.id);
  await expectCards(a1, a2);
  await selectCollection(groupA.id);
  await expectCards(a1, a2, b, free);
  await selectCollection('none');
  await expectCards(free);
  await menu('collection-filter', action('all-collections'));
  await expectCards(a1, a2, b, free);
  await selectCollection('none');
  await search(searchToken + ' только Б');
  await expectCards();
  await hiddenCount(1);
  await click('.hidden-matches button');
  await expectCards(b);
  assert.equal(await evaluate(node(queryInput) + '.value'), searchToken + ' только Б');
  assert.equal(await evaluate(node('.hidden-matches') + ' === null'), true);

  for (const [route, heading] of [['collections/' + groupA.id, groupA.name], ['sections/' + a1.id, a1.name]]) {
    await evaluate('location.hash = ' + JSON.stringify('#/' + route));
    await waitFor(node('main h1') + '?.textContent === ' + JSON.stringify(heading) + ' && Boolean(' + node(queryInput) + ')');
    assert.equal(await evaluate(node(action('collection-filter')) + ' === null'), true);
  }
}
