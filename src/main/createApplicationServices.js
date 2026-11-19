import { join } from 'node:path';
import { Database } from './database/Database.js';
import { SettingsRepository } from './repositories/SettingsRepository.js';
import { SettingsService } from './services/SettingsService.js';

export function createApplicationServices({ userData, name, version }) {
  const database = new Database(join(userData, 'data', 'inventory.sqlite'));
  return {
    info: { name, version, databasePath: database.filePath },
    settings: new SettingsService(new SettingsRepository(database)),
    close: () => database.close(),
  };
}
