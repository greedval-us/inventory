import { CATALOG_CHANNELS, CHANNELS } from '../../shared/channels.js';
import { CatalogError } from '../../shared/catalogError.js';
import { isRendererPage } from '../windows/rendererUrl.js';
import { createDatabasePicker } from '../windows/databasePicker.js';
import { createExcelExport } from '../windows/excelExport.js';
import { createExcelImport } from '../windows/excelImport.js';
import { createAttachmentDialogs } from '../windows/attachmentDialogs.js';

export function registerIpcHandlers({ ipcMain, dialog, getWindow, rendererUrl, services, photos }) {
  const picker = createDatabasePicker({ dialog, getWindow, services });
  const attachments = createAttachmentDialogs({ dialog, getWindow, services });
  const excelImport = createExcelImport({ dialog, getWindow, services });
  function handle(channel, action) {
    ipcMain.handle(channel, async (event, ...args) => {
      const window = getWindow();
      const frame = event.senderFrame;
      if (!window || window.isDestroyed() || event.sender !== window.webContents
        || !frame || frame !== window.webContents.mainFrame || !isRendererPage(frame.url, rendererUrl)) {
        throw new Error('Запрос отклонён.');
      }
      try {
        return await action(...args);
      } catch (error) {
        if (error instanceof CatalogError) throw new Error(error.message);
        console.error(`Inventory IPC ${channel}`, error);
        throw new Error('Не удалось выполнить операцию с локальными данными.');
      }
    });
  }

  handle(CHANNELS.GET_INFO, () => services.info);
  handle(CHANNELS.RELOCATE_DATABASE, picker.relocate);
  handle(CHANNELS.OPEN_DATABASE, picker.open);
  handle(CHANNELS.EXPORT_EXCEL, createExcelExport({ dialog, getWindow, services }));
  handle(CHANNELS.OPEN_EXCEL_IMPORT, excelImport.open);
  handle(CHANNELS.CHECK_EXCEL_IMPORT, excelImport.check);
  handle(CHANNELS.APPLY_EXCEL_IMPORT, excelImport.apply);
  handle(CHANNELS.CLOSE_EXCEL_IMPORT, excelImport.close);
  handle(CHANNELS.PICK_ATTACHMENTS, attachments.pick);
  handle(CHANNELS.SAVE_ATTACHMENT_AS, attachments.saveAs);
  handle(CHANNELS.PREVIEW_ATTACHMENT, input => photos.preview(input));
  handle(CHANNELS.DISCARD_ATTACHMENTS, input => services.attachments.discard(input?.ids));
  handle(CHANNELS.GET_ATTACHMENT_FOLDER, () => services.attachments.location());
  handle(CHANNELS.CHOOSE_ATTACHMENT_FOLDER, attachments.chooseFolder);
  handle(CHANNELS.RESET_ATTACHMENT_FOLDER, () => services.attachments.setFolder(null));
  handle(CHANNELS.GET_THEME, () => services.settings.getTheme());
  handle(CHANNELS.SET_THEME, theme => services.settings.setTheme(theme));
  handle(CHANNELS.GET_APPEARANCE, () => services.settings.getAppearance());
  handle(CHANNELS.SET_APPEARANCE, appearance => services.settings.setAppearance(appearance));
  for (const [operation, channel] of Object.entries(CATALOG_CHANNELS)) {
    handle(channel, input => services.catalog[operation](input));
  }
}
