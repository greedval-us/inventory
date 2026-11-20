import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { dialog } from 'electron';

const q = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
const action = name => '[data-action="' + name + '"]';
const viewer = 'dialog.photo-preview[open]';
const photoField = '[data-file-field="f_1"]';
const anyField = '[data-file-field="f_2"]';
const noteField = 'dialog textarea[name="f_3"]';
const note = 'Черновик акта — 245';

export async function checkPhotoPreview(window, evaluate, waitFor, profile) {
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()));
  const directory = mkdtempSync(join(profile, 'photo-preview-'));
  const images = [
    { name: 'Лицевая сторона.png', width: 7, height: 3 },
    { name: 'Оборот.tiff', width: 4, height: 3 },
  ];
  const png = await evaluate(`(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 7; canvas.height = 3;
    canvas.getContext('2d').fillRect(0, 0, 7, 3);
    return canvas.toDataURL('image/png').split(',')[1];
  })()`);
  writeFileSync(join(directory, images[0].name), Buffer.from(png, 'base64'));
  // Little-endian baseline TIFF with one uncompressed, 8-bit grayscale strip, 4 × 3 pixels.
  const tiff = 'SUkqAAgAAAAJAAABBAABAAAABAAAAAEBBAABAAAAAwAAAAIBAwABAAAACAAAAAMBAwABAAAAAQAAAAYBAwABAAAAAQAA' +
    'ABEBBAABAAAAegAAABUBAwABAAAAAQAAABYBBAABAAAAAwAAABcBBAABAAAADAAAAAAAAAAAFy5FXHOKobjP5v0=';
  writeFileSync(join(directory, images[1].name), Buffer.from(tiff, 'base64'));
  const damaged = 'Повреждённый снимок.png';
  const invalid = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0]); // Truncated PNG.
  writeFileSync(join(directory, damaged), invalid);
  const output = join(directory, 'Сохранённый оригинал.png');

  const realOpen = dialog.showOpenDialog;
  const realSave = dialog.showSaveDialog;
  let selection;
  dialog.showOpenDialog = async (parent, options) => {
    assert.equal(parent, window);
    assert.ok(options.properties.includes('multiSelections'));
    assert.ok(selection, 'Unexpected attachment picker');
    const files = selection;
    selection = undefined;
    return { canceled: false, filePaths: files.map(name => join(directory, name)) };
  };
  dialog.showSaveDialog = async (parent, options) => {
    assert.equal(parent, window);
    assert.equal(basename(options.defaultPath), damaged);
    return { canceled: false, filePath: output };
  };
  async function click(selector) {
    const target = q(selector);
    await waitFor(target + ' && !' + target + '.matches(":disabled")');
    await evaluate(target + '.click()');
  }
  async function pick(field, names) {
    selection = names;
    await click(field + ' ' + action('pick-attachments'));
    await waitFor('document.querySelectorAll(' + JSON.stringify(field + ' li[data-attachment-id]') + ').length === ' + names.length);
    assert.equal(selection, undefined);
  }
  async function expectImage({ name, width, height }) {
    const image = q(viewer + ' img[data-photo-preview]');
    await waitFor(q(viewer + ' h2') + '?.textContent.includes(' + JSON.stringify(name) + ') && ' +
      image + '?.complete && ' + image + '.getClientRects().length && ' +
      image + '.naturalWidth === ' + width + ' && ' + image + '.naturalHeight === ' + height, 15000);
  }
  async function press(key, windowsVirtualKeyCode) {
    for (const type of ['keyDown', 'keyUp']) {
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type, key, code: key, windowsVirtualKeyCode,
      });
    }
  }

  try {
    const table = await evaluate('window.inventory.createTable(' + JSON.stringify({
      name: 'Карточки фотографий', fields: [
        { label: 'Фото', type: 'files', fileKind: 'image' },
        { label: 'Материалы', type: 'files', fileKind: 'any' },
        { label: 'Заметка', type: 'text' },
      ],
    }) + ')');
    await evaluate('location.hash = "#/sections/' + table.id + '"');
    await waitFor(q('main h1') + '?.textContent === "Карточки фотографий"');
    await click(action('new-record'));
    await pick(photoField, [...images.map(file => file.name), damaged]);
    await pick(anyField, [images[0].name]);
    assert.equal(await evaluate('Boolean(' + q(anyField + ' ' + action('preview-attachment')) + ')'), false);
    await evaluate('(() => { const input = ' + q(noteField) + '; input.value = ' + JSON.stringify(note) +
      '; input.dispatchEvent(new Event("input", {bubbles:true})); })()');
    // Staged files have no record id yet. Navigate between originals before saving the record.
    const openFirst = photoField + ' li:first-child ' + action('preview-attachment');
    await click(openFirst);
    await expectImage(images[0]);
    await waitFor('Boolean(document.activeElement?.closest(' + JSON.stringify(viewer) + '))');
    // Chromium input exercises the native Escape/cancel event even in the hidden CI window.
    window.webContents.debugger.attach('1.3');
    try {
      await press('ArrowRight', 39);
      await expectImage(images[1]);
      await press('ArrowLeft', 37);
      await expectImage(images[0]);
      await press('Escape', 27);
    } finally {
      window.webContents.debugger.detach();
    }
    await waitFor('!' + q(viewer) + ' && ' + q(noteField) + '?.value === ' + JSON.stringify(note));
    await click(action('save-record'));
    await waitFor(q('td[data-kind="text"]') + '?.textContent.includes(' + JSON.stringify(note) + ')');

    // The saved copies must still decode after the source supplied to the picker is overwritten.
    writeFileSync(join(directory, images[0].name), invalid);
    await click('tbody td:first-child ' + action('view-photos'));
    await expectImage(images[0]);
    await click(viewer + ' .sheet-close');
    await waitFor('!document.querySelector("dialog[open]")');
    assert.equal(await evaluate('Boolean(' + q('tbody td:nth-child(2) ' + action('view-photos')) + ')'), false);
    await click('tbody td:nth-child(2) ' + action('view-attachments'));
    await click(openFirst);
    await expectImage(images[0]);
    await click(viewer + ' ' + action('next-photo'));
    await expectImage(images[1]);
    await click(viewer + ' ' + action('next-photo'));
    await waitFor(q(viewer + ' h2') + '?.textContent.includes(' + JSON.stringify(damaged) + ') && Boolean(' +
      q(viewer + ' [role=alert]') + '?.textContent.trim())');
    await click(viewer + ' ' + action('download-preview'));
    const deadline = Date.now() + 6000;
    while (!existsSync(output) && Date.now() < deadline) await delay(40);
    assert.deepEqual(readFileSync(output), invalid);
    await click(viewer + ' .sheet-close');
    await waitFor('!' + q(viewer) + ' && ' + q(noteField) + '?.value === ' + JSON.stringify(note));
    await click('dialog[open] .sheet-close');
    await waitFor('!document.querySelector("dialog[open]")');
  } finally {
    dialog.showOpenDialog = realOpen;
    dialog.showSaveDialog = realSave;
  }
}
