import { app, dialog, ipcMain, protocol } from 'electron';
import { createApplicationServices } from './createApplicationServices.js';
import { registerIpcHandlers } from './ipc/registerIpcHandlers.js';
import { createMainWindow } from './windows/createMainWindow.js';
import { getRendererUrl } from './windows/rendererUrl.js';
import { createPhotoProtocol, photoScheme } from './windows/photoProtocol.js';

app.setName('Inventory');
app.setAppUserModelId('com.greedval.inventory');

if (app.requestSingleInstanceLock()) {
  app.whenReady().then(start).catch(reportStartupError);
} else {
  app.quit();
}

async function start() {
  const appPath = app.getAppPath();
  const rendererUrl = getRendererUrl(appPath, !app.isPackaged && process.env.INVENTORY_DEV_SERVER_URL);
  const services = createApplicationServices({
    userData: app.getPath('userData'), name: app.getName(), version: app.getVersion(),
  });
  let window;
  const photos = createPhotoProtocol(services, () => window);
  // Stream responses are available on both the current and the Windows 7 Electron runtimes.
  protocol.registerStreamProtocol(photoScheme, (request, reply) => { photos.respond(request).then(reply); });
  function openWindow() {
    window = createMainWindow(appPath, rendererUrl);
    window.once('closed', () => { window = null; });
    return window.loadURL(rendererUrl);
  }
  registerIpcHandlers({ ipcMain, dialog, getWindow: () => window, rendererUrl, services, photos });
  app.once('will-quit', () => services.close());
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (!window) openWindow().catch(reportStartupError);
  });
  app.on('second-instance', () => {
    if (!window) {
      openWindow().catch(reportStartupError);
      return;
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  await openWindow();
}

function reportStartupError(error) {
  console.error('Inventory startup', error);
  dialog.showErrorBox('Inventory', 'Не удалось открыть приложение. Проверьте сборку и повторите запуск.');
  app.exit(1);
}
