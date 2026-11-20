import { win32 } from 'node:path';
import { attachmentKind } from '../../shared/attachmentKinds.js';

export function createAttachmentDialogs({ dialog, getWindow, services }) {
  // A dialog result belongs to the window and database which requested it.
  async function choose(show, apply, canceledValue) {
    const window = getWindow();
    const path = services.info.databasePath;
    const result = await show(window);
    if (result.canceled || !(result.filePaths?.length || result.filePath)
      || window.isDestroyed() || window !== getWindow() || services.info.databasePath !== path) {
      return canceledValue;
    }
    return apply(result);
  }

  return {
    pick(input) {
      const { tableId, fieldKey, recordId = null } = input ?? {};
      const field = services.catalog.getFileField({ tableId, fieldKey, recordId });
      const kind = attachmentKind(field.fileKind);
      return choose(window => dialog.showOpenDialog(window, {
        title: 'Прикрепить файлы', buttonLabel: 'Прикрепить',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: kind.label, extensions: kind.extensions }],
      }), ({ filePaths }) => services.attachments.stage({ tableId, fieldKey, recordId }, filePaths), []);
    },
    saveAs(input) {
      const file = services.attachments.describe(input?.id);
      // An imported database can contain filenames created on a different operating system.
      const name = win32.basename(file.name).replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
      const defaultPath = !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name) ? 'Вложение' : name;
      return choose(window => dialog.showSaveDialog(window, {
        title: 'Сохранить вложение как', defaultPath,
        properties: ['showOverwriteConfirmation', 'createDirectory'],
      }), async ({ filePath }) => {
        await services.attachments.download(file.id, filePath);
        return filePath;
      }, null);
    },
    chooseFolder() {
      return choose(window => dialog.showOpenDialog(window, {
        title: 'Папка для вложений', buttonLabel: 'Выбрать папку',
        properties: ['openDirectory', 'createDirectory'],
      }), ({ filePaths }) => services.attachments.setFolder(filePaths[0]), null);
    },
  };
}
