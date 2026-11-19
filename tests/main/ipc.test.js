import test from 'node:test';
import assert from 'node:assert/strict';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers.js';
import { CHANNELS } from '../../src/shared/channels.js';

test('IPC принимает запросы только из главного документа открытого окна', () => {
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
  assert.deepEqual(invoke(webContents, mainFrame), info);
  assert.throws(() => invoke(webContents, { url: mainFrame.url }), /отклонён/);
  assert.throws(() => invoke({}, mainFrame), /отклонён/);
  mainFrame.url = 'http://127.0.0.1:5175/other.html';
  assert.throws(() => invoke(webContents, mainFrame), /отклонён/);
});
