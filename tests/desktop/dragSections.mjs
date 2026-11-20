import assert from 'node:assert/strict';

async function createDragFixture() {
  const api = window.inventory;
  const table = await api.createTable({ name: 'Периферия', fields: [{ label: 'Артикул', type: 'text' }] });
  await api.saveRecord({ tableId: table.id, values: { [table.fields[0].key]: 'Клавиатура-47503' } });
  const from = await api.saveCollection({ name: 'В работе', tableIds: [table.id] });
  const to = await api.saveCollection({ name: 'В резерве', tableIds: [] });
  return { tableId: table.id, fromId: from.id, toId: to.id };
}

// Dispatch Chromium DragEvents with a single transfer, as in one pointer gesture.
async function performDrop(sourceSelector, targetSelector, external) {
  const source = document.querySelector(sourceSelector);
  const transfer = new DataTransfer();
  const event = name => new DragEvent(name, { bubbles: true, cancelable: true, dataTransfer: transfer });
  if (external) {
    transfer.setData('text/plain', source.title);
  } else {
    source.dispatchEvent(event('dragstart'));
    await Promise.resolve();
  }
  const target = document.querySelector(targetSelector);
  if (!target) throw new Error('Не найдена область переноса ' + targetSelector);
  const over = event('dragover');
  target.dispatchEvent(over);
  target.dispatchEvent(event('drop'));
  if (!external) source.dispatchEvent(event('dragend'));
  return over.defaultPrevented;
}

export async function checkDragSections(window, evaluate, waitFor) {
  window.setContentSize(1060, 720);
  await waitFor('innerWidth > 1000');
  const { tableId, fromId, toId } = await evaluate('(' + createDragFixture.toString() + ')()');
  const source = 'nav [data-drag-section="' + tableId + '"]';
  const collection = id => 'nav [data-drop-collection="' + id + '"]';
  const inCollection = id => collection(id) + ' [data-drag-section="' + tableId + '"]';
  const group = 'main [data-section-id="' + tableId + '"]';
  const element = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
  const visible = selector => waitFor(element(selector) + '?.getClientRects().length');
  async function click(selector) {
    await visible(selector);
    await evaluate(element(selector) + '.click()');
  }
  async function drop(target, external = false) {
    await waitFor(element(source) + '?.draggable');
    const args = [source, target, external].map(value => JSON.stringify(value)).join(',');
    const accepted = await evaluate('(' + performDrop.toString() + ')(' + args + ')');
    assert.equal(accepted, !external, 'Принимается только перенос своего раздела');
  }
  async function findRecord() {
    await visible('main input[name=query]');
    await evaluate(`(() => {
      const search = document.querySelector('main input[name=query]');
      search.value = '47503';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitFor(element(group) + "?.textContent.includes('Клавиатура-47503')");
  }
  await click('nav a[href="#/settings"]');
  await visible('input[name=theme]');
  await click('nav a[href="#/"]');
  await click(collection(fromId) + ' [data-action=open-collection]');
  await visible(group);
  await drop(collection(toId), true);
  await visible(inCollection(fromId));
  await drop(collection(toId));
  await visible(inCollection(toId));
  await waitFor('!' + element(group));
  await click(collection(toId) + ' [data-action=open-collection]');
  await findRecord();

  await drop('nav [data-action=ungroup-dragged-section]');
  await waitFor(element(source) + ' && !' + element(inCollection(toId)));
  await waitFor('!' + element(group));
  await click('nav a[href="#/"]');
  await findRecord();
  await click(source);
  await waitFor(element('main h1') + "?.textContent === 'Периферия'");

  await drop('nav [data-action=delete-dragged-section]');
  await waitFor(element('dialog .confirm-message') + "?.textContent.includes('Периферия')");
  await click('dialog [data-action=cancel-delete]');
  await waitFor('!document.querySelector("dialog[open]")');
  await visible(source);
  await drop('nav [data-action=delete-dragged-section]');
  await click('dialog [data-action=confirm-delete-section]');
  await waitFor('location.hash === "#/" && !' + element(source));
  const result = await evaluate("window.inventory.searchRecords({ query: '47503' })");
  assert.equal(result.total, 0);
}
