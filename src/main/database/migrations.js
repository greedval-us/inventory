// Индекс миграции + 1 соответствует сохранённому PRAGMA user_version.
export const migrations = [
  `
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
    INSERT INTO app_settings (key, value) VALUES ('theme', 'system');
  `,
  `
    CREATE TABLE catalog_tables (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      fields TEXT NOT NULL CHECK (json_valid(fields))
    ) STRICT;
    CREATE TABLE catalog_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES catalog_tables(id),
      search_values TEXT NOT NULL CHECK (json_valid(search_values))
    ) STRICT;
    CREATE INDEX catalog_records_by_table ON catalog_records(table_id, id);
  `,
  `
    CREATE TABLE catalog_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE
    ) STRICT;
    ALTER TABLE catalog_tables ADD COLUMN collection_id INTEGER REFERENCES catalog_collections(id) ON DELETE SET NULL;
    CREATE INDEX catalog_tables_by_collection ON catalog_tables(collection_id);

    -- Keep section IDs stable even after the section with the highest ID is deleted.
    CREATE TABLE catalog_table_sequence (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      last_id INTEGER NOT NULL
    ) STRICT;
    INSERT INTO catalog_table_sequence SELECT 1, coalesce(max(id), 0) FROM catalog_tables;
  `,
  `
    ALTER TABLE catalog_tables ADD COLUMN last_field_id INTEGER NOT NULL DEFAULT 0;
    UPDATE catalog_tables SET last_field_id = (
      SELECT max(CAST(substr(json_extract(value, '$.key'), 3) AS INTEGER)) FROM json_each(fields)
    );
  `,
  `
    CREATE TABLE catalog_table_sorts (
      table_id INTEGER PRIMARY KEY REFERENCES catalog_tables(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('asc', 'desc'))
    ) STRICT;
    CREATE TRIGGER clear_removed_field_sort AFTER UPDATE OF fields ON catalog_tables
    BEGIN
      DELETE FROM catalog_table_sorts
      WHERE table_id = NEW.id AND field_key NOT IN (
        SELECT json_extract(value, '$.key') FROM json_each(NEW.fields)
      );
    END;
  `,
  `
    CREATE TABLE catalog_column_widths (
      table_id INTEGER NOT NULL REFERENCES catalog_tables(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      width INTEGER NOT NULL CHECK (width BETWEEN 64 AND 1600),
      PRIMARY KEY (table_id, field_key)
    ) STRICT;
    CREATE TRIGGER clear_removed_column_widths AFTER UPDATE OF fields ON catalog_tables
    BEGIN
      DELETE FROM catalog_column_widths
      WHERE table_id = NEW.id AND field_key NOT IN (
        SELECT json_extract(value, '$.key') FROM json_each(NEW.fields)
      );
    END;
  `,
];
