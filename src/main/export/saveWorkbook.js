import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CatalogError } from '../../shared/catalogError.js';

export async function saveWorkbook(sheets, filePath) {
  // Load the Excel writer only when the first export is requested.
  const { writeWorkbook } = await import('./workbook.js');
  const temporary = join(dirname(filePath), '.inventory-' + randomUUID() + '.tmp');
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.close();
      await writeWorkbook(sheets, temporary);
      // Replace the destination only after the complete XLSX has been written.
      await rename(temporary, filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  } catch (error) {
    if (['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) {
      throw new CatalogError('Не удалось сохранить книгу. Закройте файл в Excel или выберите другую папку.');
    }
    if (error.code === 'ENOSPC') throw new CatalogError('На диске недостаточно места для книги Excel.');
    if (error.code === 'ENOENT') throw new CatalogError('Папка для сохранения недоступна. Выберите другую.');
    throw error;
  }
}
