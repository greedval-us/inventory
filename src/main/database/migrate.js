import { migrations } from './migrations.js';

const APPLICATION_ID = 0x494e5654; // INVT

export function migrate(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const { application_id: appId } = db.prepare('PRAGMA application_id').get();
    const { user_version: version } = db.prepare('PRAGMA user_version').get();
    if (appId !== APPLICATION_ID) {
      const hasSchema = db.prepare("SELECT 1 FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' LIMIT 1").get();
      if (appId !== 0 || version !== 0 || hasSchema) {
        throw new Error('Несовместимая база данных Inventory.');
      }
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
    }
    if (version < 0 || version > migrations.length) {
      throw new Error('Неподдерживаемая версия базы данных Inventory.');
    }
    for (let index = version; index < migrations.length; index++) {
      db.exec(migrations[index]);
      db.exec(`PRAGMA user_version = ${index + 1}`);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
