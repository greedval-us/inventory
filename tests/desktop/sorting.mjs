const collectionName = 'Сортировка по полям';
const numbers = 'Номера полок';
const names = 'Названия полок';
const first = 'f_1';
const second = 'f_2';

async function seedSorting(collectionName, numbers, names) {
  const api = window.inventory;
  const collection = await api.saveCollection({ name: collectionName, tableIds: [] });
  const fixtures = [
    { name: numbers, fields: [{ label: 'Номер', type: 'number' }, { label: 'Метка', type: 'text' }],
      rows: [{ f_1: 2, f_2: 'Б' }, { f_1: 120, f_2: 'А' }, { f_1: 30, f_2: 'Я' }] },
    { name: names, fields: [{ label: 'Название', type: 'text' }],
      rows: [{ f_1: 'Ящик 2' }, { f_1: 'Бумага' }, { f_1: 'Ящик 10' }] },
  ];
  for (const { name, fields, rows } of fixtures) {
    const table = await api.createTable({ name, fields, collectionId: collection.id });
    for (const values of rows) await api.saveRecord({ tableId: table.id, values });
  }
}

// Runs in Chromium. Some views paginate the results, so compare every displayed row
// to the corresponding part of the expected order.
function matchesGrid(name, sortedKey, direction, expectedValues) {
  const table = document.querySelector('table[aria-label="' + name + '"]');
  if (!table) return false;
  const active = table.querySelectorAll('th[aria-sort="ascending"], th[aria-sort="descending"]');
  if (active.length !== (sortedKey ? 1 : 0)) return false;
  if (sortedKey && (active[0].getAttribute('aria-sort') !== direction ||
    !active[0].querySelector('[data-sort-key="' + sortedKey + '"]'))) return false;
  const values = Array.from(table.querySelectorAll('tbody tr td:first-child'), td => td.textContent.trim());
  return values.length > 0 && values.every((value, i) => value === expectedValues[i]);
}

export async function checkSorting(window, evaluate, waitFor, phase) {
  window.setContentSize(1120, 740);
  if (phase === 'sorting') {
    await evaluate('(' + seedSorting + ')(...' + JSON.stringify([collectionName, numbers, names]) + ')');
  }
  const tables = await evaluate('window.inventory.listTables()');
  const { id, collectionId } = tables.find(table => table.name === numbers);
  async function open(route, title) {
    await evaluate('location.hash = ' + JSON.stringify(route));
    await waitFor("document.querySelector('main h1')?.textContent === " + JSON.stringify(title));
  }
  async function click(name, key) {
    const selector = 'table[aria-label="' + name + '"] [data-sort-key="' + key + '"]';
    const button = 'document.querySelector(' + JSON.stringify(selector) + ')';
    await waitFor(button + '?.matches(":enabled")');
    await evaluate(button + '.click()');
  }
  const expect = (...expected) => waitFor('(' + matchesGrid + ')(...' + JSON.stringify(expected) + ')');
  const original = () => expect(numbers, null, null, ['30', '120', '2']);
  const ascending = () => expect(numbers, first, 'ascending', ['2', '30', '120']);
  const descending = () => expect(numbers, first, 'descending', ['120', '30', '2']);
  const alphabetical = () => expect(names, first, 'ascending', ['Бумага', 'Ящик 2', 'Ящик 10']);

  if (phase === 'sorting') {
    await open('#/collections/' + collectionId, collectionName);
    await original();
    await click(numbers, first);
    await ascending();
    await click(numbers, second);
    await expect(numbers, second, 'ascending', ['120', '2', '30']);
    await click(numbers, first);
    await ascending();
    await click(numbers, first);
    await descending();
    await click(names, first);
    await alphabetical();
    return;
  }

  await open('#/', 'Все разделы');
  await alphabetical();
  if (phase === 'sortingRestart') {
    await descending();
    await open('#/sections/' + id, numbers);
    await descending();
    await click(numbers, first);
    await original();
    await open('#/collections/' + collectionId, collectionName);
  }
  await original();
  await alphabetical();
}
