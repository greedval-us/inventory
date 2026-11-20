import { dirname } from 'node:path';

export function createDatabasePicker({ dialog, getWindow, services }) {
  let picking = false;

  async function pick(options, usePath) {
    if (picking) return null;
    picking = true;
    try {
      const window = getWindow();
      const currentPath = services.info.databasePath;
      const { canceled, filePaths } = await dialog.showOpenDialog(window, {
        ...options,
        ...(currentPath ? { defaultPath: dirname(currentPath) } : {}),
      });
      if (canceled || !filePaths.length || window.isDestroyed() || window !== getWindow()) return null;
      return usePath(filePaths[0]);
    } finally {
      picking = false;
    }
  }

  return {
    relocate: () => pick({
      title: 'Выберите папку для базы Inventory',
      buttonLabel: 'Использовать папку',
      properties: ['openDirectory', 'createDirectory'],
    }, folder => services.relocateDatabase(folder)),
    open: () => pick({
      title: 'Открыть базу Inventory',
      properties: ['openFile'],
      filters: [{ name: 'Базы SQLite', extensions: ['sqlite', 'sqlite3', 'db'] }, { name: 'Все файлы', extensions: ['*'] }],
    }, file => services.openDatabase(file)),
  };
}
