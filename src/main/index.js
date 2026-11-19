import { app, dialog, ipcMain } from 'electron';
import { createApplicationServices } from './createApplicationServices.js';
import { registerIpcHandlers } from './ipc/registerIpcHandlers.js';
import { createMainWindow } from './windows/createMainWindow.js';
import { getRendererUrl } from './windows/rendererUrl.js';

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
  function openWindow() {
    window = createMainWindow(appPath, rendererUrl);
    window.once('closed', () => { window = null; });
    return window.loadURL(rendererUrl);
  }
  registerIpcHandlers({ ipcMain, getWindow: () => window, rendererUrl, services });
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
