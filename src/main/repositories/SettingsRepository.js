export class SettingsRepository {
  constructor(database) {
    this.database = database;
  }

  get(key) {
    return this.database.open().prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value;
  }

  set(key, value) {
    this.database.open().prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }
}
