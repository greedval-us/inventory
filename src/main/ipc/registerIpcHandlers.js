import { CATALOG_CHANNELS, CHANNELS } from '../../shared/channels.js';
import { CatalogError } from '../../shared/catalogError.js';
import { isRendererPage } from '../windows/rendererUrl.js';

export function registerIpcHandlers({ ipcMain, getWindow, rendererUrl, services }) {
  function handle(channel, action) {
    ipcMain.handle(channel, (event, ...args) => {
      const window = getWindow();
      const frame = event.senderFrame;
      if (!window || window.isDestroyed() || event.sender !== window.webContents
        || !frame || frame !== window.webContents.mainFrame || !isRendererPage(frame.url, rendererUrl)) {
        throw new Error('Запрос отклонён.');
      }
      try {
        return action(...args);
      } catch (error) {
        if (error instanceof CatalogError) throw new Error(error.message);
        console.error(`Inventory IPC ${channel}`, error);
        throw new Error('Не удалось выполнить операцию с локальными данными.');
      }
    });
  }

  handle(CHANNELS.GET_INFO, () => services.info);
  handle(CHANNELS.GET_THEME, () => services.settings.getTheme());
  handle(CHANNELS.SET_THEME, theme => services.settings.setTheme(theme));
  handle(CHANNELS.GET_APPEARANCE, () => services.settings.getAppearance());
  handle(CHANNELS.SET_APPEARANCE, appearance => services.settings.setAppearance(appearance));
  for (const [operation, channel] of Object.entries(CATALOG_CHANNELS)) {
    handle(channel, input => services.catalog[operation](input));
  }
}
