import assert from 'node:assert/strict';

const collection = 'Размеры столбцов';
const disks = 'Размеры — диски';
const docs = 'Размеры — документы';

async function seed(collection, names) {
  const api = window.inventory;
  const { id: collectionId } = await api.saveCollection({ name: collection, tableIds: [] });
  const fields = [{ label: 'Модель', type: 'text' }, { label: 'Метка', type: 'text' }, { label: 'Номер', type: 'number' }];
  for (const [index, name] of names.entries()) {
    const table = await api.createTable({ name, collectionId, fields: index === 0 ? fields : fields.slice(0, 1) });
    for (const model of ['А', 'Я']) {
      await api.saveRecord({ tableId: table.id, values: { f_1: model } });
    }
  }
}

// Measure both header and data cells. A declared CSS width can differ from the width used by table layout.
function measured(name, key, expected) {
  const table = document.querySelector('table[aria-label="' + name + '"]');
  const header = table?.querySelector('[data-sort-key="' + key + '"]')?.closest('th');
  const cell = header && table.tBodies[0].rows[0]?.cells[header.cellIndex];
  return cell && [header, cell].every(el => Math.abs(el.getBoundingClientRect().width - expected) <= 1);
}

function describeWidth(name, key) {
  const table = document.querySelector('table[aria-label="' + name + '"]');
  const handle = table?.querySelector('[data-resize-key="' + key + '"]');
  const header = handle?.closest('th');
  const cell = header && table.tBodies[0].rows[0]?.cells[header.cellIndex];
  return {
    header: header?.getBoundingClientRect().width, cell: cell?.getBoundingClientRect().width,
    separatorValue: handle?.getAttribute('aria-valuenow'), table: table?.getBoundingClientRect().width,
    layout: table && getComputedStyle(table).tableLayout, columns: Array.from(table?.querySelectorAll('col') ?? [], col => col.style.width),
  };
}

function controlPoint(selector) {
  const control = document.querySelector(selector);
  const { x, y, width, height } = control.getBoundingClientRect();
  const point = { x: Math.round(x + width / 2), y: Math.floor(y + height / 2) };
  return control.contains(document.elementFromPoint(point.x, point.y)) ? point : null;
}

const inPage = (fn, ...args) => '(' + fn + ')(...' + JSON.stringify(args) + ')';

export async function checkColumnWidths(window, evaluate, waitFor, phase) {
  window.setContentSize(1120, 740);
  if (phase === 'widths') await evaluate(inPage(seed, collection, [disks, docs]));
  const sections = await evaluate('window.inventory.listTables()');
  const a = sections.find(table => table.name === disks);
  const b = sections.find(table => table.name === docs);
  const grid = name => 'table[aria-label="' + name + '"]';
  const query = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
  async function expectWidth(name, key, width) {
    try {
      await waitFor(inPage(measured, name, key, width));
    } catch (cause) {
      const actual = await evaluate(inPage(describeWidth, name, key));
      throw new Error('Column ' + name + '/' + key + ' expected ' + width + 'px: ' + JSON.stringify(actual), { cause });
    }
  }

  async function open(route, title) {
    await evaluate('location.hash = ' + JSON.stringify(route));
    await waitFor(query('main h1') + '?.textContent === ' + JSON.stringify(title));
  }

  const expectedSizes = async () => {
    await expectWidth(disks, 'f_1', 178);
    await expectWidth(disks, 'f_2', 196);
    await expectWidth(docs, 'f_1', 264);
  };

  if (phase === 'widths') {
    const chromium = window.webContents.debugger;
    chromium.attach('1.3');
    try {
      const mouse = (type, point, button = 'none', buttons = 0) => chromium.sendCommand('Input.dispatchMouseEvent',
        { type, ...point, button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
      async function press(key, modifiers = 0) {
        for (const type of ['keyDown', 'keyUp']) {
          await chromium.sendCommand('Input.dispatchKeyEvent', { type, key, code: key, modifiers });
        }
      }
      async function pointFor(selector) {
        await waitFor('Boolean(' + query(selector) + ')');
        await evaluate(query(selector) + '.scrollIntoView({block:"nearest", inline:"nearest"})');
        const expression = inPage(controlPoint, selector);
        await waitFor(expression);
        return evaluate(expression);
      }
      async function drag(section, key, target, cancel = false) {
        const selector = grid(section.name) + ' [data-resize-key="' + key + '"]';
        const start = await pointFor(selector);
        const initial = await evaluate(query(selector) + '.closest("th").getBoundingClientRect().width');
        const width = target ?? Math.round(initial) + 62;
        const end = { x: start.x + width - Math.round(initial), y: start.y };
        await mouse('mouseMoved', start);
        await mouse('mousePressed', start, 'left', 1);
        await mouse('mouseMoved', end, 'left', 1);
        await expectWidth(section.name, key, width);
        if (cancel) {
          await press('Escape');
          await expectWidth(section.name, key, initial);
        }
        await mouse('mouseReleased', end, 'left');
        await waitFor('(async () => (await window.inventory.listColumnWidths())[' + section.id + ']?.['
          + JSON.stringify(key) + '] === ' + (cancel ? initial : width) + ')()');
      }
      await open('#/sections/' + a.id, disks);
      await drag(a, 'f_1');
      assert.ok(await evaluate(query(grid(disks) + ' th:is([aria-sort="ascending"], [aria-sort="descending"])') + ' === null'));
      const button = await pointFor(grid(disks) + ' [data-sort-key="f_1"]');
      await mouse('mousePressed', button, 'left', 1);
      await mouse('mouseReleased', button, 'left');
      await waitFor(query(grid(disks) + ' th[aria-sort="ascending"] [data-sort-key="f_1"]') + ' !== null');
      await drag(a, 'f_1', 178);
      await drag(a, 'f_1', 212, true);
      await evaluate(query(grid(disks) + ' [data-resize-key="f_1"]') + '.focus()');
      await press('ArrowRight', 8); // Chromium's Shift modifier.
      await expectWidth(disks, 'f_1', 179);
      await press('ArrowLeft', 8);
      await expectWidth(disks, 'f_1', 178);
      await drag(a, 'f_2', 196);
      await expectWidth(disks, 'f_1', 178);
      assert.ok(await evaluate('Boolean(' + query(grid(disks) + ' th[aria-sort="ascending"] [data-sort-key="f_1"]') + ')'));
      await open('#/collections/' + a.collectionId, collection);
      await drag(b, 'f_1', 264);
      await expectedSizes();
    } finally {
      chromium.detach();
    }
  }

  window.setContentSize(740, 600);
  await open('#/', 'Все разделы');
  await expectedSizes();
  await open('#/collections/' + a.collectionId, collection);
  await expectedSizes();
  await open('#/sections/' + b.id, docs);
  await expectWidth(docs, 'f_1', 264);
}
