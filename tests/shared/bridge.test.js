import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../../src/shared/bridge.js';
import { CHANNELS } from '../../src/shared/channels.js';

test('bridge предоставляет только операции приложения и проверяет тему перед IPC', async () => {
  const bridge = createBridge(async (...args) => args);
  assert.deepEqual(Object.keys(bridge).sort(), ['getInfo', 'getTheme', 'setTheme']);
  assert.deepEqual(await bridge.getInfo(), [CHANNELS.GET_INFO]);
  assert.deepEqual(await bridge.getTheme(), [CHANNELS.GET_THEME]);
  assert.deepEqual(await bridge.setTheme('light'), [CHANNELS.SET_THEME, 'light']);
  await assert.rejects(bridge.setTheme({ theme: 'dark' }));
});
