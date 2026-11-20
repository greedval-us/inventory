import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { CatalogError } from '../../shared/catalogError.js';

export function createExcelImport({ dialog, getWindow, services }) {
  let session;
  let opening = false;

  function current(context) {
    return context.window === getWindow() && !context.window.isDestroyed()
      && context.database === services.databaseRevision;
  }

  function requireSession(token) {
    if (!session || session.token !== token || !current(session)) {
      throw new CatalogError('Откройте книгу заново для текущего раздела.');
    }
    return session;
  }

  async function open(input) {
    if (opening) throw new CatalogError('Дождитесь завершения выбора книги Excel.');
    const table = services.catalog.getTable(input?.tableId);
    const context = { window: getWindow(), database: services.databaseRevision };
    opening = true;
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(context.window, {
        title: 'Заполнить раздел из Excel', buttonLabel: 'Выбрать книгу',
        filters: [{ name: 'Книга Excel', extensions: ['xlsx'] }], properties: ['openFile'],
      });
      if (canceled || !filePaths?.length) return null;
      if (!current(context)) throw new CatalogError('База изменилась. Откройте книгу заново.');
      const [filePath] = filePaths;
      if (extname(filePath).toLowerCase() !== '.xlsx') throw new CatalogError('Выберите книгу Excel в формате .xlsx.');
      const { readImportBook } = await import('../import/readImportBook.js');
      const book = await readImportBook(filePath);
      if (!current(context)) throw new CatalogError('База изменилась. Откройте книгу заново.');
      const token = randomUUID();
      session = { ...context, token, table, book, checked: null };
      return {
        token, fileName: basename(filePath), sheetNames: book.sheetNames,
        fields: table.fields.map(({ key, label }) => ({ key, label })),
      };
    } finally {
      opening = false;
    }
  }

  function check(input) {
    const active = requireSession(input?.token);
    active.checked = null;
    if (typeof input.hasHeader !== 'boolean' || !active.book.sheetNames.includes(input.sheetName)) {
      throw new CatalogError('Выберите лист и укажите, есть ли заголовки в первой строке.');
    }
    const { id, fields } = active.table;
    if (!isDeepStrictEqual(fields, services.catalog.getTable(id).fields)) {
      throw new CatalogError('Поля раздела изменились. Откройте заполнение из Excel заново.');
    }
    const { rows, ...report } = active.book.inspect(input.sheetName, input.hasHeader, fields);
    const revision = randomUUID();
    if (report.issueCount === 0 && report.rowCount > 0) active.checked = { revision, rows };
    return { revision, ...report };
  }

  function apply(input) {
    const active = requireSession(input?.token);
    if (!active.checked || active.checked.revision !== input.revision) {
      throw new CatalogError('Проверьте выбранный лист перед добавлением записей.');
    }
    const { id: tableId, fields } = active.table;
    const result = services.catalog.importRecords({ tableId, fields, rows: active.checked.rows });
    session = undefined;
    return result;
  }

  function close(input) {
    if (session && session.token === input?.token) session = undefined;
  }

  return { open, check, apply, close };
}
