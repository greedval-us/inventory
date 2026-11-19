// Индекс миграции + 1 соответствует сохранённому PRAGMA user_version.
export const migrations = [
  `
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
    INSERT INTO app_settings (key, value) VALUES ('theme', 'system');
  `,
];
