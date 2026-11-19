import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { isRendererPage } from './rendererUrl.js';

export function createMainWindow(appPath, rendererUrl) {
  const window = new BrowserWindow({
    title: 'Inventory',
    width: 1180, height: 800, minWidth: 640, minHeight: 480,
    show: false,
    webPreferences: {
      preload: join(appPath, 'build', 'main', 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false,
    },
  });
  window.removeMenu();
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => {
    if (!isRendererPage(event.url, rendererUrl)) event.preventDefault();
  });
  contents.on('will-redirect', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.session.setPermissionCheckHandler(() => false);
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.once('ready-to-show', () => window.show());
  return window;
}
