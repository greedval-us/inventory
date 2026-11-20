import { deleteCollection, listCollections, saveCollection } from './collections.js';
import { copyTableStructure, deleteTable, getFileField, getTable, insertTable, listTables, moveTable, previewFieldOptions, updateTable } from './tables.js';
import { deleteRecord, importRecords, saveRecord } from './records.js';
import { searchRecordGroups, searchRecords } from './search.js';
import { exportSheets } from './exportSheets.js';
import { listTableSorts, setTableSort } from './tableSorts.js';
import { listColumnWidths, setColumnWidth } from './columnWidths.js';
import { getAttachment, listAttachments } from './attachments.js';
import { CatalogError } from '../../shared/catalogError.js';

function transaction(db, begin, operation) {
  db.exec(begin);
  try {
    const result = operation(db);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function createCatalog(database, { resolveStaged } = {}) {
  const read = operation => input => transaction(database.open(), 'BEGIN', db => operation(db, input));
  const write = operation => input => transaction(database.open(), 'BEGIN IMMEDIATE', db => operation(db, input));
  return {
    listTables: () => listTables(database.open()),
    getTable: read(getTable),
    listTableSorts: () => listTableSorts(database.open()),
    setTableSort: write(setTableSort),
    listColumnWidths: () => listColumnWidths(database.open()),
    setColumnWidth: write(setColumnWidth),
    createTable: write(insertTable),
    copyTableStructure: write(copyTableStructure),
    updateTable: write(updateTable),
    previewFieldOptions: read(previewFieldOptions),
    moveTable: write(moveTable),
    deleteTable: write(deleteTable),
    listCollections: () => listCollections(database.open()),
    saveCollection: write(saveCollection),
    deleteCollection: input => deleteCollection(database.open(), input),
    saveRecord: write((db, input) => saveRecord(db, input, resolveStaged)),
    importRecords: write(importRecords),
    deleteRecord: input => deleteRecord(database.open(), input),
    searchRecords: read(searchRecords),
    searchRecordGroups: read(searchRecordGroups),
    exportSheets: read(exportSheets),
    getFileField: read(getFileField),
    getAttachment: read(getAttachment),
    getImageAttachment: read((db, owner) => {
      const field = getFileField(db, owner);
      if (field.fileKind !== 'image') throw new CatalogError('Просмотр доступен в поле «Фото и изображения».');
      return resolveStaged?.(owner.id, owner) ?? getAttachment(db, owner.id, owner);
    }),
    listAttachments: read(listAttachments),
    listRemovedAttachmentIds: read(db => db.prepare('SELECT id FROM removed_attachments').all().map(file => file.id)),
    listRemovedAttachments: read(db => db.prepare('SELECT id, storage FROM removed_attachments').all()),
    forgetRemovedAttachment: write((db, id) => db.prepare('DELETE FROM removed_attachments WHERE id = ?').run(id)),
  };
}
