import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { dialog } from 'electron';
import { objectPath } from '../../src/main/attachments/storageFiles.js';

const sectionName = 'Акты с вложениями';
const first = 'Акт № 245.pdf';
const second = 'Примечания.txt';
const sample = Buffer.from('%PDF-1.4\n% Тестовые байты 245\n%%EOF', 'utf8');
const notes = Buffer.from('Строка с кириллицей\r\nЕщё одна строка', 'utf8');
const action = name => '[data-action="' + name + '"]';
const q = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';

async function waitForFile(path, present) {
  const deadline = Date.now() + 6000;
  while (existsSync(path) !== present) {
    if (Date.now() >= deadline) throw new Error('Unexpected file state: ' + path);
    await delay(50);
  }
}

export async function checkAttachments(window, evaluate, waitFor, profile, phase) {
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()));
  const directory = join(profile, 'Файловая проверка');
  const chosen = join(directory, 'Хранилище');
  const paths = [join(directory, first), join(directory, second)];
  const input = q('input[name=attachmentFolder]');
  const field = 'dialog [data-file-field="f_1"]';
  const cell = q('td[data-kind=files]');
  const nativeOpen = dialog.showOpenDialog;
  const nativeSave = dialog.showSaveDialog;
  let openFiles;
  let saving;
  dialog.showOpenDialog = async (parent, options) => {
    assert.equal(parent, window);
    if (options.properties.includes('openDirectory')) return { canceled: false, filePaths: [chosen] };
    assert.ok(options.properties.includes('multiSelections'));
    assert.ok(options.filters.some(filter => filter.extensions.includes('pdf')));
    assert.ok(Array.isArray(openFiles), 'Unexpected file picker');
    const filePaths = openFiles;
    openFiles = undefined;
    return { canceled: !filePaths.length, filePaths };
  };
  dialog.showSaveDialog = async (parent, { defaultPath }) => {
    assert.equal(parent, window);
    assert.ok(saving, 'Unexpected download picker');
    assert.equal(basename(defaultPath), saving.name);
    return { canceled: false, filePath: saving.path };
  };

  async function click(selector) {
    const el = q(selector);
    await waitFor(el + ' && !' + el + '.matches(":disabled")');
    await evaluate(el + '.click()');
  }
  async function fill(selector, value, event) {
    await waitFor('Boolean(' + q(selector) + ')');
    await evaluate('(() => {const el=' + q(selector) + ';el.value=' + JSON.stringify(value) +
      ';el.dispatchEvent(new Event(' + JSON.stringify(event) + ',{bubbles:true}));})()');
  }
  async function folderSettings() {
    await click('a[href="#/settings"]');
    await click(action('attachment-settings'));
    await waitFor('Boolean(' + input + '?.value)');
    return evaluate(input + '.value');
  }
  async function openSection() {
    const section = (await evaluate('window.inventory.listTables()')).find(table => table.name === sectionName);
    assert.equal(section.fields[0].fileKind, 'document');
    await click('nav a[href="#/sections/' + section.id + '"]');
    await waitFor(q('main h1') + '?.textContent === ' + JSON.stringify(sectionName));
  }
  async function download(id, name, bytes) {
    saving = { name, path: join(directory, 'Выгрузка — ' + name) };
    await click(field + ' li[data-attachment-id="' + id + '"] ' + action('save-attachment-as'));
    await waitForFile(saving.path, true);
    assert.deepEqual(readFileSync(saving.path), bytes);
    saving = undefined;
  }

  try {
    if (phase === 'attachments') {
      mkdirSync(chosen, { recursive: true });
      writeFileSync(paths[0], sample);
      writeFileSync(paths[1], notes);
      await click('a[href="#/sections/new"]');
      await fill('input[name=tableName]', sectionName, 'input');
      await fill('input[name=fieldLabel]', 'Вложения', 'input');
      await fill('select[name=fieldType]', 'files', 'change');
      await fill('select[name=fieldKind]', 'document', 'change');
      await click('form button[type=submit]');
      await click(action('new-record'));
      openFiles = paths;
      await click(field + ' ' + action('pick-attachments'));
      await waitFor('document.querySelectorAll(' + JSON.stringify(field + ' li[data-attachment-id]') + ').length === 2');
      await click(action('save-record'));
      await waitFor(cell + '?.textContent.includes(' + JSON.stringify(second) + ')');
      // The selected source can change; saved and downloaded bytes must remain the originals.
      for (const path of paths) writeFileSync(path, 'Файл источника изменён');
      const folder = await folderSettings();
      assert.equal(dirname(dirname(folder)), join(profile, 'data'));
      await click(action('choose-attachment-folder'));
      await waitFor(input + '.value !== ' + JSON.stringify(folder));
      assert.equal(dirname(await evaluate(input + '.value')), chosen);
      return;
    }

    const active = await folderSettings();
    assert.equal(dirname(active), chosen, 'The folder must survive a full restart');
    await openSection();
    await waitFor(cell + '?.textContent.includes(' + JSON.stringify(first) + ')');
    await click(action('view-attachments'));
    await waitFor(q(field + ' li[data-attachment-id]') + ' !== null');
    const ids = await evaluate('Array.from(document.querySelectorAll(' + JSON.stringify(field + ' li[data-attachment-id]') +
      '), item => item.dataset.attachmentId)');
    assert.equal(ids.length, 2);
    await download(ids[0], first, sample);
    const remove = field + ' [data-attachment-id="' + ids[0] + '"] ' + action('remove-attachment');
    await click(remove);
    openFiles = [paths[0]];
    await click(field + ' ' + action('pick-attachments'));
    await waitFor('document.querySelectorAll(' + JSON.stringify(field + ' li[data-attachment-id]') + ').length === 2');
    const draft = await evaluate(q(field + ' li[data-attachment-id]:last-child') + '.dataset.attachmentId');
    assert.ok(!ids.includes(draft));
    await click('dialog .sheet-close');
    await waitFor('!document.querySelector("dialog[open]")');
    await click(action('edit-record'));
    await waitForFile(objectPath(active, draft), false);
    await click(remove); // Cancel kept this file attached.
    await click(action('save-record'));
    await waitFor(cell + '?.textContent.includes(' + JSON.stringify(second) + ') && !' +
      cell + '.textContent.includes(' + JSON.stringify(first) + ')');
    await waitForFile(objectPath(active, ids[0]), false);
    await folderSettings();
    await click(action('reset-attachment-folder'));
    await waitFor('!' + q(action('reset-attachment-folder')));
    assert.equal(dirname(dirname(await evaluate(input + '.value'))), join(profile, 'data'));
    await openSection();
    await click(action('edit-record'));
    await download(ids[1], second, notes);
    await click('dialog .sheet-close');
    await waitFor('!document.querySelector("dialog[open]")');
    assert.equal(readFileSync(paths[0], 'utf8'), 'Файл источника изменён');
  } finally {
    dialog.showOpenDialog = nativeOpen;
    dialog.showSaveDialog = nativeSave;
  }
}
