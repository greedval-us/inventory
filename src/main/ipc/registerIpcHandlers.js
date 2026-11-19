import { CHANNELS } from '../../shared/channels.js';
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
        console.error(`Inventory IPC ${channel}`, error);
        throw new Error('Не удалось выполнить операцию с локальными данными.');
      }
    });
  }

  handle(CHANNELS.GET_INFO, () => services.info);
  handle(CHANNELS.GET_THEME, () => services.settings.getTheme());
  handle(CHANNELS.SET_THEME, theme => services.settings.setTheme(theme));
}
