import test from 'node:test';
import assert from 'node:assert/strict';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers.js';
import { CHANNELS } from '../../src/shared/channels.js';
import { CatalogError } from '../../src/shared/catalogError.js';

test('IPC принимает запросы только из главного документа открытого окна', async () => {
  const handlers = new Map();
  const rendererUrl = 'http://127.0.0.1:5175/';
  const mainFrame = { url: rendererUrl + '#/settings' };
  const webContents = { mainFrame };
  const window = { webContents, isDestroyed: () => false };
  const info = { name: 'Inventory', version: '0.1.0', databasePath: '/data/inventory.sqlite' };
  registerIpcHandlers({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    getWindow: () => window, rendererUrl, services: { info },
  });
  const invoke = (sender, senderFrame) => handlers.get(CHANNELS.GET_INFO)({ sender, senderFrame });
  assert.deepEqual(await invoke(webContents, mainFrame), info);
  await assert.rejects(invoke(webContents, { url: mainFrame.url }), /отклонён/);
  await assert.rejects(invoke({}, mainFrame), /отклонён/);
  mainFrame.url = 'http://127.0.0.1:5175/other.html';
  await assert.rejects(invoke(webContents, mainFrame), /отклонён/);
});

test('выбор файла базы использует результат диалога и передаёт сообщения об ошибках в интерфейс', async () => {
  const handlers = new Map();
  const frame = { url: 'file:///inventory/index.html#/settings' };
  const window = { webContents: { mainFrame: frame }, isDestroyed: () => false };
  let respond;
  const paths = [];
  const dialog = { showOpenDialog: () => new Promise(resolve => { respond = resolve; }) };
  registerIpcHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    getWindow: () => window, rendererUrl: 'file:///inventory/index.html', dialog,
    services: {
      info: { databasePath: null },
      openDatabase(path) { paths.push(path); throw new CatalogError('Выберите базу Inventory.'); },
    },
  });
  const choose = () => handlers.get(CHANNELS.OPEN_DATABASE)({ sender: window.webContents, senderFrame: frame }, 'ignored');
  const canceled = choose();
  assert.equal(await choose(), null);
  respond({ canceled: true, filePaths: [] });
  assert.equal(await canceled, null);
  assert.deepEqual(paths, []);
  const invalid = choose();
  respond({ canceled: false, filePaths: ['selected.sqlite'] });
  await assert.rejects(invalid, /Выберите базу Inventory/);
  assert.deepEqual(paths, ['selected.sqlite']);
});
