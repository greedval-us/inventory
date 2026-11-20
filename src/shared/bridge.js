import { CATALOG_CHANNELS, CHANNELS } from './channels.js';
import { validateAppearance, validateTheme } from './settings.js';

export function createBridge(invoke) {
  return Object.freeze({
    getInfo: () => invoke(CHANNELS.GET_INFO),
    relocateDatabase: () => invoke(CHANNELS.RELOCATE_DATABASE),
    openDatabase: () => invoke(CHANNELS.OPEN_DATABASE),
    exportExcel: selection => invoke(CHANNELS.EXPORT_EXCEL, selection),
    openExcelImport: input => invoke(CHANNELS.OPEN_EXCEL_IMPORT, input),
    checkExcelImport: input => invoke(CHANNELS.CHECK_EXCEL_IMPORT, input),
    applyExcelImport: input => invoke(CHANNELS.APPLY_EXCEL_IMPORT, input),
    closeExcelImport: input => invoke(CHANNELS.CLOSE_EXCEL_IMPORT, input),
    pickAttachments: input => invoke(CHANNELS.PICK_ATTACHMENTS, input),
    discardAttachments: input => invoke(CHANNELS.DISCARD_ATTACHMENTS, input),
    saveAttachmentAs: input => invoke(CHANNELS.SAVE_ATTACHMENT_AS, input),
    previewAttachment: input => invoke(CHANNELS.PREVIEW_ATTACHMENT, input),
    getAttachmentFolder: () => invoke(CHANNELS.GET_ATTACHMENT_FOLDER),
    chooseAttachmentFolder: () => invoke(CHANNELS.CHOOSE_ATTACHMENT_FOLDER),
    resetAttachmentFolder: () => invoke(CHANNELS.RESET_ATTACHMENT_FOLDER),
    getTheme: () => invoke(CHANNELS.GET_THEME),
    setTheme: async theme => invoke(CHANNELS.SET_THEME, validateTheme(theme)),
    getAppearance: () => invoke(CHANNELS.GET_APPEARANCE),
    setAppearance: async appearance => invoke(CHANNELS.SET_APPEARANCE, validateAppearance(appearance)),
    ...Object.fromEntries(Object.entries(CATALOG_CHANNELS).map(([name, channel]) =>
      [name, (...args) => invoke(channel, ...args)])),
  });
}
