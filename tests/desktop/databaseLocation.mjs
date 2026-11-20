import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { dialog } from 'electron';

export const databasePhases = ['databaseRelocate', 'databaseReopen', 'databaseRestored'];
const tableName = 'Проверка размещения базы';
const originalRecord = 'До смены папки';
const copyRecord = 'Только в новой базе';

export function databaseFiles(profile) {
  const directory = resolve(profile);
  assert.equal(dirname(directory), resolve(tmpdir()), 'Database location tests require a temporary profile');
  const folder = join(directory, 'Выбранная папка');
  return { folder, original: join(directory, 'data', 'inventory.sqlite'), copy: join(folder, 'inventory.sqlite') };
}

export async function checkDatabaseLocation(window, evaluate, waitFor, profile, phase) {
  const files = databaseFiles(profile);
  const input = 'document.querySelector(\'main input[name="databasePath"]\')';
  const pathInSettings = file => waitFor(input + '?.value === ' + JSON.stringify(file));
  const button = action => 'document.querySelector(' + JSON.stringify('[data-action="' + action + '"]') + ')';
  const current = () => evaluate('window.inventory.getInfo().then(info => info.databasePath)');
  const table = () => evaluate('window.inventory.listTables().then(list => list.find(t => t.name === ' + JSON.stringify(tableName) + '))');
  async function records() {
    const section = await table();
    assert.ok(section, 'Missing test section in selected database');
    const result = await evaluate('window.inventory.searchRecords({tableId:' + section.id + '})');
    return result.rows.map(row => row.values.f_1).sort();
  }
  async function addRecord(id, value) {
    await evaluate('window.inventory.saveRecord(' + JSON.stringify({ tableId: id, values: { f_1: value } }) + ')');
  }

  // Replace only the Windows picker. The button, preload, IPC, SQLite and renderer reload are real.
  const nativeDialog = dialog.showOpenDialog;
  let answer;
  dialog.showOpenDialog = async (parent, options) => {
    assert.ok(answer, 'Unexpected native file picker');
    const { path, picked } = answer;
    answer = null;
    picked({ parent, properties: options.properties });
    return { canceled: !path, filePaths: path ? [path] : [] };
  };
  async function choose(action, path, expected) {
    const control = button(action);
    await waitFor(control + '?.matches(":enabled")');
    const picked = new Promise(resolve => { answer = { path, picked: resolve }; });
    const reloaded = path && once(window.webContents, 'did-finish-load', { signal: AbortSignal.timeout(8000) });
    const [options] = await Promise.all([picked, reloaded, evaluate(control + '.click()')]);
    assert.equal(options.parent, window);
    const expectedProperty = action === 'relocate-database' ? 'openDirectory' : 'openFile';
    assert.ok(options.properties.includes(expectedProperty), 'Expected native ' + expectedProperty + ' picker');
    await waitFor(control + '?.matches(":enabled")');
    await pathInSettings(expected);
    assert.equal(await current(), expected);
  }
  try {
    const active = phase === 'databaseReopen' ? files.copy : files.original;
    await pathInSettings(active);
    if (phase === 'databaseRelocate') {
      const source = await evaluate('window.inventory.createTable(' + JSON.stringify({
        name: tableName, fields: [{ label: 'Метка', type: 'text' }],
      }) + ')');
      await addRecord(source.id, originalRecord);
      await choose('relocate-database', null, files.original);
      await choose('open-database', null, files.original);
      mkdirSync(files.folder);
      await choose('relocate-database', files.folder, files.copy);
      assert.deepEqual(await records(), [originalRecord]);
      await addRecord(source.id, copyRecord);
      assert.deepEqual(await records(), [originalRecord, copyRecord].sort());
    } else {
      if (phase === 'databaseReopen') {
        assert.deepEqual(await records(), [originalRecord, copyRecord].sort());
        await choose('open-database', files.original, files.original);
      }
      assert.deepEqual(await records(), [originalRecord]);
    }
  } finally {
    dialog.showOpenDialog = nativeDialog;
  }
}
