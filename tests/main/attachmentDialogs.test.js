import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttachmentDialogs } from '../../src/main/windows/attachmentDialogs.js';

test('диалог выбирает несколько файлов нужной категории и передаёт только выбранные Windows пути', async () => {
  const owner = { tableId: 3, fieldKey: 'f_2', recordId: 7 };
  const window = { isDestroyed: () => false };
  const files = ['scan.JPG', 'photo.png'];
  const api = createAttachmentDialogs({
    getWindow: () => window,
    dialog: { showOpenDialog(parent, options) {
      assert.equal(parent, window);
      assert.ok(options.properties.includes('multiSelections'));
      assert.ok(options.filters[0].extensions.includes('jpg'));
      return { canceled: false, filePaths: files };
    } },
    services: {
      info: { databasePath: 'inventory.sqlite' },
      catalog: { getFileField(input) { assert.deepEqual(input, owner); return { fileKind: 'image' }; } },
      attachments: { stage(input, paths) { assert.deepEqual(input, owner); assert.deepEqual(paths, files); return ['ok']; } },
    },
  });
  assert.deepEqual(await api.pick({ ...owner, filePaths: ['unselected.txt'] }), ['ok']);
});

test('смена базы во время выбора пути отменяет сохранение вложения и смену папки', async () => {
  const window = { isDestroyed: () => false };
  const info = { databasePath: 'first.sqlite' };
  let finish;
  const respond = () => new Promise(resolve => { finish = resolve; });
  const api = createAttachmentDialogs({
    getWindow: () => window, dialog: { showOpenDialog: respond, showSaveDialog: respond },
    services: { info, attachments: { describe: () => ({ id: 'one', name: 'photo.jpg' }) } },
  });
  const save = api.saveAs({ id: 'one' });
  info.databasePath = 'second.sqlite';
  finish({ canceled: false, filePath: 'test.jpg' });
  assert.equal(await save, null);
  const pick = api.chooseFolder();
  info.databasePath = 'third.sqlite';
  finish({ canceled: false, filePaths: ['test-directory'] });
  assert.equal(await pick, null);
});
