import { migrations } from './migrations.js';

export const APPLICATION_ID = 0x494e5654; // INVT

export function migrate(db, existingOnly = false) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const { application_id: appId } = db.prepare('PRAGMA application_id').get();
    const { user_version: version } = db.prepare('PRAGMA user_version').get();
    if (appId !== APPLICATION_ID) {
      const hasSchema = db.prepare("SELECT 1 FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' LIMIT 1").get();
      if (existingOnly || appId !== 0 || version !== 0 || hasSchema) {
        throw new Error('Несовместимая база данных Inventory.');
      }
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
    }
    if (version < (existingOnly ? 1 : 0) || version > migrations.length) {
      throw new Error('Неподдерживаемая версия базы данных Inventory.');
    }
    for (let index = version; index < migrations.length; index++) {
      db.exec(migrations[index]);
      db.exec(`PRAGMA user_version = ${index + 1}`);
    }
    if (existingOnly) {
      // Preparing these queries also checks older profiles after migration, before COMMIT.
      db.prepare('SELECT key, value FROM app_settings');
      db.prepare('SELECT id, name, name_key, description, fields, collection_id, last_field_id FROM catalog_tables');
      db.prepare('SELECT id, table_id, search_values FROM catalog_records');
      db.prepare('SELECT id, name, name_key FROM catalog_collections');
      db.prepare('SELECT singleton, last_id FROM catalog_table_sequence');
      db.prepare('SELECT table_id, field_key, direction FROM catalog_table_sorts');
      db.prepare('SELECT table_id, field_key, width FROM catalog_column_widths');
      db.prepare('SELECT id, record_id, field_key, position, name, size FROM catalog_attachments');
      db.prepare('SELECT id, storage FROM removed_attachments');
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
