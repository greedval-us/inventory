import { DatabaseLocation } from './database/DatabaseLocation.js';
import { AttachmentStorage } from './attachments/AttachmentStorage.js';
import { prepareDatabase } from './attachments/storageLocation.js';
import { SettingsRepository } from './repositories/SettingsRepository.js';
import { SettingsService } from './services/SettingsService.js';

export function createApplicationServices({ userData, name, version }) {
  const database = new DatabaseLocation(userData);
  const attachments = new AttachmentStorage(database, userData);
  const catalog = attachments.catalog;
  let databaseRevision = 0;
  const info = () => ({ name, version, databasePath: database.filePath });
  function selectDatabase(method, path) {
    attachments.assertIdle();
    const previous = database.filePath;
    database[method](path, selected => prepareDatabase(selected, method === 'openFile'));
    if (previous !== database.filePath) {
      databaseRevision++;
      attachments.reset();
    }
    return info();
  }
  function withCleanup(operation) {
    return input => {
      const result = operation(input);
      attachments.sweep();
      return result;
    };
  }
  return {
    get info() { return info(); },
    get databaseRevision() { return databaseRevision; },
    relocateDatabase: folder => selectDatabase('relocate', folder),
    openDatabase: file => selectDatabase('openFile', file),
    settings: new SettingsService(new SettingsRepository(database)),
    attachments,
    catalog: {
      ...catalog,
      saveRecord: withCleanup(input => {
        const record = catalog.saveRecord(input);
        attachments.saved(record);
        return record;
      }),
      deleteRecord: withCleanup(catalog.deleteRecord),
      updateTable: withCleanup(catalog.updateTable),
      deleteTable: withCleanup(catalog.deleteTable),
    },
    close() { attachments.close(); database.close(); },
  };
}
