import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../../src/shared/bridge.js';
import { CHANNELS } from '../../src/shared/channels.js';
import { DEFAULT_APPEARANCE } from '../../src/shared/settings.js';

test('bridge предоставляет только операции приложения и проверяет настройки перед IPC', async () => {
  const bridge = createBridge(async (...args) => args);
  assert.deepEqual(Object.keys(bridge).sort(), [
    'copyTableStructure', 'createTable', 'deleteCollection', 'deleteRecord', 'deleteTable', 'exportExcel', 'getAppearance', 'getInfo', 'getTheme',
    'listCollections', 'listColumnWidths', 'listTableSorts', 'listTables', 'moveTable', 'openDatabase', 'previewFieldOptions', 'relocateDatabase', 'saveCollection', 'saveRecord',
    'searchRecordGroups', 'searchRecords', 'setAppearance', 'setColumnWidth', 'setTableSort', 'setTheme', 'updateTable',
    'pickAttachments', 'discardAttachments', 'saveAttachmentAs', 'previewAttachment',
    'getAttachmentFolder', 'chooseAttachmentFolder', 'resetAttachmentFolder',
    'openExcelImport', 'checkExcelImport', 'applyExcelImport', 'closeExcelImport',
  ].sort());
  assert.deepEqual(await bridge.getInfo(), [CHANNELS.GET_INFO]);
  assert.deepEqual(await bridge.relocateDatabase('/unused/path'), [CHANNELS.RELOCATE_DATABASE]);
  assert.deepEqual(await bridge.openDatabase('/unused/file'), [CHANNELS.OPEN_DATABASE]);
  assert.deepEqual(await bridge.chooseAttachmentFolder('/unused'), [CHANNELS.CHOOSE_ATTACHMENT_FOLDER]);
  assert.deepEqual(await bridge.resetAttachmentFolder('/unused'), [CHANNELS.RESET_ATTACHMENT_FOLDER]);
  assert.deepEqual(await bridge.pickAttachments({ tableId: 1, fieldKey: 'f_1' }, '/unused/file'), [
    CHANNELS.PICK_ATTACHMENTS, { tableId: 1, fieldKey: 'f_1' },
  ]);
  const photo = { tableId: 1, fieldKey: 'f_2', recordId: null, id: 'photo-id' };
  assert.deepEqual(await bridge.previewAttachment(photo, '/unused/file'), [CHANNELS.PREVIEW_ATTACHMENT, photo]);
  const selection = { tableId: 2, collectionId: null, field: '', query: '', sections: [{ tableId: 2, fieldKeys: ['f_1'] }] };
  assert.deepEqual(await bridge.exportExcel(selection, '/unused/file'), [CHANNELS.EXPORT_EXCEL, selection]);
  assert.deepEqual(await bridge.getTheme(), [CHANNELS.GET_THEME]);
  assert.deepEqual(await bridge.setTheme('light'), [CHANNELS.SET_THEME, 'light']);
  await assert.rejects(bridge.setTheme({ theme: 'dark' }));
  assert.deepEqual(await bridge.getAppearance(), [CHANNELS.GET_APPEARANCE]);
  assert.deepEqual(await bridge.setAppearance(DEFAULT_APPEARANCE), [CHANNELS.SET_APPEARANCE, DEFAULT_APPEARANCE]);
  await assert.rejects(bridge.setAppearance({ ...DEFAULT_APPEARANCE, fontSize: 10 }));
  assert.deepEqual(await bridge.listTables(), [CHANNELS.LIST_TABLES]);
  assert.deepEqual(await bridge.listTableSorts(), [CHANNELS.LIST_TABLE_SORTS]);
  const sorting = { tableId: 2, sort: null };
  assert.deepEqual(await bridge.setTableSort(sorting), [CHANNELS.SET_TABLE_SORT, sorting]);
  assert.deepEqual(await bridge.listColumnWidths(), [CHANNELS.LIST_COLUMN_WIDTHS]);
  const width = { tableId: 2, fieldKey: 'f_1', width: 208 };
  assert.deepEqual(await bridge.setColumnWidth(width), [CHANNELS.SET_COLUMN_WIDTH, width]);
  const schema = { name: 'Документы', fields: [{ label: 'Номер', type: 'text' }] };
  assert.deepEqual(await bridge.createTable(schema), [CHANNELS.CREATE_TABLE, schema]);
  const copy = { sourceId: 2, name: 'Архив', collectionId: null };
  assert.deepEqual(await bridge.copyTableStructure(copy), [CHANNELS.COPY_TABLE_STRUCTURE, copy]);
  const update = { id: 1, name: 'Акты', collectionId: 3 };
  assert.deepEqual(await bridge.updateTable(update), [CHANNELS.UPDATE_TABLE, update]);
  const field = { tableId: 1, fieldKey: 'f_1' };
  assert.deepEqual(await bridge.previewFieldOptions(field), [CHANNELS.PREVIEW_FIELD_OPTIONS, field]);
  const move = { id: 1, collectionId: null };
  assert.deepEqual(await bridge.moveTable(move), [CHANNELS.MOVE_TABLE, move]);
  assert.deepEqual(await bridge.deleteTable({ id: 1 }), [CHANNELS.DELETE_TABLE, { id: 1 }]);
  assert.deepEqual(await bridge.listCollections(), [CHANNELS.LIST_COLLECTIONS]);
  const collection = { name: 'Бухгалтерия', tableIds: [1] };
  assert.deepEqual(await bridge.saveCollection(collection), [CHANNELS.SAVE_COLLECTION, collection]);
  assert.deepEqual(await bridge.deleteCollection({ id: 3 }), [CHANNELS.DELETE_COLLECTION, { id: 3 }]);
  const filter = { field: 'Номер', query: 'Акт' };
  assert.deepEqual(await bridge.searchRecords(filter), [CHANNELS.SEARCH_RECORDS, filter]);
  const grouped = { query: '245', offsets: { 2: 50 } };
  assert.deepEqual(await bridge.searchRecordGroups(grouped), [CHANNELS.SEARCH_RECORD_GROUPS, grouped]);
  const record = { tableId: 2, id: 7, values: { f_1: 'Акт-53' } };
  assert.deepEqual(await bridge.saveRecord(record), [CHANNELS.SAVE_RECORD, record]);
  const identity = { tableId: 2, id: 7 };
  assert.deepEqual(await bridge.deleteRecord(identity), [CHANNELS.DELETE_RECORD, identity]);
});
