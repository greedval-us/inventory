import { extname } from 'node:path';
import { CatalogError } from '../../shared/catalogError.js';
import { sameFile } from '../database/databaseFiles.js';
import { saveWorkbook } from '../export/saveWorkbook.js';

export function createExcelExport({ dialog, getWindow, services }) {
  let exporting = false;
  return async input => {
    if (exporting) throw new CatalogError('Дождитесь завершения текущего экспорта.');
    exporting = true;
    try {
      const sheets = services.catalog.exportSheets(input);
      if (!sheets.length) throw new CatalogError('По выбранному фильтру нет записей. Измените условия поиска.');
      const label = sheets.length === 1 ? sheets[0].name.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, ' ') : '';
      const fileName = label ? 'Inventory — ' + Array.from(label).slice(0, 70).join('').trim() : 'Inventory';
      const parent = getWindow();
      const { canceled, filePath } = await dialog.showSaveDialog(parent, {
        title: 'Экспорт в Excel', buttonLabel: 'Сохранить', defaultPath: fileName + '.xlsx',
        filters: [{ name: 'Книга Excel', extensions: ['xlsx'] }],
        properties: ['showOverwriteConfirmation', 'createDirectory'],
      });
      if (canceled || !filePath || parent.isDestroyed() || parent !== getWindow()) return null;
      if (extname(filePath).toLowerCase() !== '.xlsx') throw new CatalogError('Укажите имя файла с расширением .xlsx.');
      if (sameFile(filePath, services.info.databasePath)) throw new CatalogError('Выберите для выгрузки отдельный файл. Этот файл используется как база данных.');
      await saveWorkbook(sheets, filePath);
      return { filePath, sheetCount: sheets.length, rowCount: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) };
    } finally {
      exporting = false;
    }
  };
}
