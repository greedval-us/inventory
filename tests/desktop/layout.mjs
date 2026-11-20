import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// These rows live only in the temporary desktop smoke profile.
async function seedRegistry() {
  const api = window.inventory;
  const [disks, docs] = await api.listTables();
  for (const [table, values] of [
    [disks, ['Samsung 870 EVO', 1024, 'SATA', true]],
    [disks, ['Toshiba Canvio', 2048, 'USB', false]],
    [docs, ['Акт приёма № 245', 'Поставка комплектующих']],
    [docs, ['Гарантийный талон', 'Сервисный отдел']],
  ]) {
    await api.saveRecord({ tableId: table.id, values: Object.fromEntries(table.fields.map((f, i) => [f.key, values[i]])) });
  }
}

function isReachable(selector) {
  const element = document.querySelector(selector);
  if (!element) return false;
  const box = element.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return box.width > 0 && box.height > 0 && !!hit && element.contains(hit);
}

export async function checkLayout(window, evaluate, waitFor) {
  const reachable = selector => '(' + isReachable.toString() + ')(' + JSON.stringify(selector) + ')';
  const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
  const dir = process.env.INVENTORY_SCREENSHOTS;
  // A transparent, inactive window lets Chromium composite the optional captures on Windows.
  window.webContents.setBackgroundThrottling(false);
  if (dir) {
    window.setOpacity(0);
    window.setSkipTaskbar(true);
    window.showInactive();
  }
  async function capture(name) {
    if (!dir) return;
    const client = window.webContents.debugger;
    client.attach();
    try {
      await evaluate('document.fonts.ready.then(() => new Promise(requestAnimationFrame))');
      await waitFor(`!document.getAnimations().some(a =>
        (a.pending || a.playState === 'running') && Number.isFinite(a.effect?.getComputedTiming().endTime)
      )`);
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const { data } = await client.sendCommand('Page.captureScreenshot', { format: 'png', fromSurface: true });
      assert.ok(data?.length, 'Empty screenshot: ' + name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name + '.png'), Buffer.from(data, 'base64'));
    } finally {
      client.detach();
    }
  }
  async function resize(width, height) {
    window.setContentSize(width, height);
    await waitFor(`Math.abs(innerWidth-${width}) <= 1 && Math.abs(innerHeight-${height}) <= 1`);
  }
  async function openRegistry(theme) {
    await click('a[href="#/settings"]');
    const choice = 'input[name="theme"][value="' + theme + '"]:enabled';
    await waitFor('Boolean(document.querySelector(' + JSON.stringify(choice) + '))');
    await click(choice);
    await waitFor('document.documentElement.dataset.theme === ' + JSON.stringify(theme) +
      ' && Boolean(document.querySelector(' + JSON.stringify(choice + ':checked') + '))');
    await click('a[href="#/"]');
    await waitFor("document.querySelector('main')?.innerText.includes('Samsung 870 EVO')");
  }
  async function checkFrame() {
    assert.ok(await evaluate('[document.documentElement, document.body].every(e => e.scrollWidth <= innerWidth + 1 && e.scrollHeight <= innerHeight + 1)'), 'The document should fit the window');
    await waitFor(reachable('[data-action="new-record"]'));
    await waitFor(reachable('input[name="query"]'));
  }

  await evaluate('(' + seedRegistry.toString() + ')()');
  await resize(1180, 760);
  await openRegistry('light');
  await capture('registry-light');
  await checkFrame();
  assert.ok(await evaluate(`[...document.querySelectorAll('.workspace, .registry-content, .grid-scroll')].every(
    el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1
  )`), 'Ordinary sections should fit the desktop content area');
  await openRegistry('dark');
  await capture('registry-dark');
  await resize(640, 480);
  await capture('registry-compact');
  await checkFrame();
  await waitFor("document.querySelector('.registry-content').scrollHeight <= document.querySelector('.registry-content').clientHeight + 1");
  const menu = '[data-action="toggle-navigation"]';
  await waitFor(reachable(menu));
  await click(menu);
  await waitFor(reachable('nav a[href="#/settings"]'));
  await click('nav a[href="#/settings"]');
  await waitFor('Boolean(document.querySelector("input[name=theme]:checked"))');
  await click(menu);
  await waitFor(reachable('nav a[href="#/"]'));
  await click('nav a[href="#/"]');
  await waitFor(reachable('[data-action="new-record"]'));

  const id = await evaluate(`(async () => {
    const fields = Array.from({length: 14}, (_, i) => ({label: 'Характеристика ' + (i + 1), type: 'text'}));
    const table = await window.inventory.createTable({name: 'Спецификации', fields});
    for (let n = 1; n <= 30; n++) {
      const values = Object.fromEntries(table.fields.map((f, index) => [f.key, index === 0 ? 'Позиция ' + n : 'A-' + index]));
      await window.inventory.saveRecord({tableId: table.id, values});
    }
    return table.id;
  })()`);
  await evaluate(`location.hash = '#/sections/${id}'`);
  await waitFor("document.querySelector('th:nth-child(14)')?.textContent.includes('14')");
  await checkFrame();
  const next = 'button[aria-label="Следующая страница — Спецификации"]';
  const previous = 'button[aria-label="Предыдущая страница — Спецификации"]';
  const firstCell = "document.querySelector('tbody tr td')?.textContent.trim()";
  await waitFor(firstCell + " === 'Позиция 30' && document.querySelectorAll('tbody tr').length < 30");
  await waitFor(reachable(next + ':enabled'));
  await click(next);
  await waitFor(firstCell + "?.startsWith('Позиция ') && " + firstCell + " !== 'Позиция 30'");
  await waitFor(reachable(previous + ':enabled'));
  await click(previous);
  await waitFor(firstCell + " === 'Позиция 30'");
  assert.ok(await evaluate(`(() => {
    const grid = document.querySelector('.grid-scroll');
    grid.scrollLeft = grid.scrollWidth;
    return ['auto','scroll'].includes(getComputedStyle(grid).overflowX) && grid.scrollLeft > 0;
  })()`), 'Wide data should scroll inside its table');
  await click('[data-action="new-record"]');
  await waitFor('Boolean(document.querySelector("dialog[open] [name=f_14]"))');
  await capture('record-compact');
  for (const selector of ['dialog [name=f_14]', 'dialog [data-action="save-record"]', 'dialog [aria-label="Закрыть"]']) {
    await evaluate('document.querySelector(' + JSON.stringify(selector) + ').scrollIntoView({behavior:"instant", block:"nearest"})');
    await waitFor(reachable(selector));
  }
  await click('dialog [aria-label="Закрыть"]');
  await waitFor('!document.querySelector("dialog[open]")');
  const debuggerClient = window.webContents.debugger;
  debuggerClient.attach();
  try {
    await debuggerClient.sendCommand('Emulation.setEmulatedMedia', { features: [{name: 'prefers-reduced-motion', value: 'reduce'}] });
    await waitFor("matchMedia('(prefers-reduced-motion: reduce)').matches");
    assert.ok(await evaluate(`[...document.querySelectorAll('nav a, main button')].every(el => {
      const style = getComputedStyle(el);
      return style.transitionProperty === 'none' || style.transitionDuration.split(',').every(t => parseFloat(t) <= 0.001);
    })`), 'Reduced motion should disable visible control transitions');
  } finally {
    debuggerClient.detach();
  }
}
