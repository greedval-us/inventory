import { deleteCollection, listCollections, saveCollection } from './collections.js';
import { deleteTable, insertTable, listTables, moveTable, previewFieldOptions, updateTable } from './tables.js';
import { deleteRecord, saveRecord } from './records.js';
import { searchRecordGroups, searchRecords } from './search.js';
import { listTableSorts, setTableSort } from './tableSorts.js';
import { listColumnWidths, setColumnWidth } from './columnWidths.js';

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

export function createCatalog(database) {
  const read = operation => input => transaction(database.open(), 'BEGIN', db => operation(db, input));
  const write = operation => input => transaction(database.open(), 'BEGIN IMMEDIATE', db => operation(db, input));
  return {
    listTables: () => listTables(database.open()),
    listTableSorts: () => listTableSorts(database.open()),
    setTableSort: write(setTableSort),
    listColumnWidths: () => listColumnWidths(database.open()),
    setColumnWidth: write(setColumnWidth),
    createTable: write(insertTable),
    updateTable: write(updateTable),
    previewFieldOptions: read(previewFieldOptions),
    moveTable: write(moveTable),
    deleteTable: write(deleteTable),
    listCollections: () => listCollections(database.open()),
    saveCollection: write(saveCollection),
    deleteCollection: input => deleteCollection(database.open(), input),
    saveRecord: write(saveRecord),
    deleteRecord: input => deleteRecord(database.open(), input),
    searchRecords: read(searchRecords),
    searchRecordGroups: read(searchRecordGroups),
  };
}
