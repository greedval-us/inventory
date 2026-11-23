import assert from 'node:assert/strict';
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createApplicationServices } from '../../src/main/createApplicationServices.js';
import { CatalogError } from '../../src/shared/catalogError.js';

function fixture(t) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'inventory-location-')));
  const userData = join(root, 'profile');
  const instances = [];
  function start() {
    const app = createApplicationServices({ userData, name: 'Inventory', version: '1' });
    instances.push(app);
    return app;
  }
  function folder(name) {
    const path = join(root, name);
    mkdirSync(path);
    return path;
  }
  t.after(() => {
    for (const app of instances) app.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { userData, root, start, folder };
}

test('перенос копирует согласованный снимок с WAL, сохраняет путь и оставляет независимый оригинал', t => {
  const { start, folder } = fixture(t);
  const app = start();
  const source = app.info.databasePath;
  const table = app.catalog.createTable({ name: 'Диски', fields: [{ label: 'Марка', type: 'text' }] });
  const reader = new DatabaseSync(source, { readOnly: true });
  const destination = folder('Данные #45%');
  const target = join(destination, 'inventory.sqlite');
  try {
    reader.exec('BEGIN; SELECT * FROM catalog_records;');
    const record = app.catalog.saveRecord({ tableId: table.id, values: { f_1: 'Марка 245' } });
    app.settings.setTheme('dark');
    assert.ok(existsSync(source + '-wal'));
    assert.equal(app.relocateDatabase(destination).databasePath, target);
    assert.deepEqual(app.relocateDatabase(destination), app.info);
    assert.deepEqual(app.catalog.searchRecords({ query: '245' }).rows, [record]);
    assert.equal(app.settings.getTheme(), 'dark');
  } finally {
    reader.close();
  }
  app.close();
  const next = start();
  assert.equal(next.info.databasePath, target);
  assert.equal(next.catalog.searchRecords().total, 1);
  next.settings.setTheme('light');
  next.catalog.deleteTable({ id: table.id });
  assert.equal(next.openDatabase(source).databasePath, source);
  assert.equal(next.catalog.searchRecords().total, 1);
  assert.equal(next.settings.getTheme(), 'dark');
  next.close();
  const original = start();
  assert.equal(original.info.databasePath, source);
  assert.equal(original.openDatabase(target).databasePath, target);
  assert.equal(original.settings.getTheme(), 'light');
  assert.deepEqual(original.catalog.listTables(), []);
});

test('открывает актуальную базу, пока другое соединение пишет в WAL', t => {
  const { start } = fixture(t);
  const app = start();
  app.settings.setTheme('dark');
  const path = app.info.databasePath;
  app.openDatabase(path);
  app.close();

  const writer = new DatabaseSync(path);
  try {
    writer.exec("BEGIN IMMEDIATE; UPDATE app_settings SET value = 'light' WHERE key = 'theme'");
    const reader = start();
    assert.equal(reader.settings.getTheme(), 'dark');
    writer.exec('COMMIT');
    assert.equal(reader.settings.getTheme(), 'light');
  } finally {
    writer.close();
  }
});

test('избегает замены файлов, журналов и активной базы под другим именем', t => {
  const { start, folder } = fixture(t);
  const app = start();
  app.settings.setTheme('dark');
  const source = app.info.databasePath;
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const destination = folder('collision' + suffix);
    const name = 'inventory.sqlite' + suffix;
    writeFileSync(join(destination, name), 'Существующие данные');
    assert.throws(() => app.relocateDatabase(destination), CatalogError);
    assert.deepEqual(readdirSync(destination), [name]);
    assert.equal(readFileSync(join(destination, name), 'utf8'), 'Существующие данные');
    assert.equal(app.info.databasePath, source);
  }
  const alias = folder('alias');
  linkSync(source, join(alias, 'inventory.sqlite'));
  assert.equal(app.relocateDatabase(alias).databasePath, source);
  assert.equal(app.openDatabase(join(alias, 'inventory.sqlite')).databasePath, source);
  assert.equal(app.settings.getTheme(), 'dark');
});

test('при переносе не заменяет оборванную ссылку в папке назначения', t => {
  const { start, folder } = fixture(t);
  const app = start();
  const links = folder('links');
  const detached = folder('detached');
  const dangling = join(links, 'inventory.sqlite');
  try {
    symlinkSync(detached, dangling, 'junction');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Нет разрешения на создание ссылок.');
    throw error;
  }
  rmSync(detached, { recursive: true });
  assert.throws(() => app.relocateDatabase(links), CatalogError);
  assert.ok(lstatSync(dangling).isSymbolicLink());
  assert.equal(existsSync(detached), false);
});

test('явное открытие отклоняет пустые, чужие и отсутствующие файлы без изменений на диске', t => {
  const { start, folder } = fixture(t);
  const app = start();
  const selected = folder('existing');
  const foreign = join(selected, 'foreign.sqlite');
  const db = new DatabaseSync(foreign);
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE foreign_data (value TEXT);');
  db.close();
  const empty = join(selected, 'empty.db');
  writeFileSync(empty, '');
  const invalid = join(selected, 'notes.txt');
  writeFileSync(invalid, 'Записи пользователя');
  const contents = new Map(readdirSync(selected).map(name => [name, readFileSync(join(selected, name))]));
  for (const file of [foreign, empty, invalid, join(selected, 'missing.sqlite'), selected, app.info.databasePath]) {
    assert.throws(() => app.openDatabase(file), CatalogError);
  }
  assert.equal(existsSync(app.info.databasePath), false);
  assert.deepEqual(readdirSync(selected), [...contents.keys()]);
  for (const [name, bytes] of contents) assert.deepEqual(readFileSync(join(selected, name)), bytes);
  const defaultFile = app.info.databasePath;
  mkdirSync(dirname(defaultFile), { recursive: true });
  writeFileSync(defaultFile, '');
  assert.throws(() => app.openDatabase(defaultFile), CatalogError);
  assert.equal(readFileSync(defaultFile).length, 0);
});

test('после отключения диска открывает приложение для выбора базы и не создаёт потерянный файл', t => {
  const { start, folder } = fixture(t);
  const app = start();
  const source = app.info.databasePath;
  app.settings.setTheme('dark');
  const destination = folder('disk');
  const target = app.relocateDatabase(destination).databasePath;
  app.close();
  renameSync(destination, destination + '-offline');
  const next = start();
  assert.equal(next.info.databasePath, target);
  assert.throws(() => next.settings.getTheme(), CatalogError);
  assert.throws(() => next.catalog.listTables(), CatalogError);
  assert.equal(existsSync(destination), false);
  assert.equal(next.openDatabase(source).databasePath, source);
  assert.equal(next.settings.getTheme(), 'dark');
});

test('запоминает явный выбор исходного пути и отклоняет базу с повреждённой схемой', t => {
  const { start, folder } = fixture(t);
  const app = start();
  const source = app.info.databasePath;
  app.settings.setTheme('dark');
  assert.equal(app.openDatabase(source).databasePath, source);
  app.close();
  renameSync(source, source + '.backup');
  const next = start();
  assert.throws(() => next.settings.getTheme(), CatalogError);
  assert.equal(existsSync(source), false);
  renameSync(source + '.backup', source);
  const target = next.relocateDatabase(folder('other')).databasePath;
  next.openDatabase(source);
  const damaged = new DatabaseSync(target);
  damaged.exec('DROP TABLE catalog_column_widths');
  damaged.close();
  assert.throws(() => next.openDatabase(target), CatalogError);
  assert.equal(next.info.databasePath, source);
  assert.equal(next.settings.getTheme(), 'dark');
});

test('сбой записи выбранного пути отменяет переключение и позволяет повторить перенос', t => {
  const { start, folder, userData } = fixture(t);
  const app = start();
  const source = app.info.databasePath;
  app.settings.setTheme('dark');
  const config = join(userData, 'database-location.json');
  mkdirSync(config);
  const dest = folder('new-location');
  assert.throws(() => app.relocateDatabase(dest), CatalogError);
  assert.equal(app.info.databasePath, source);
  assert.equal(app.settings.getTheme(), 'dark');
  assert.deepEqual(readdirSync(dest), []);
  assert.deepEqual(readdirSync(userData).sort(), ['data', 'database-location.json']);
  rmSync(config, { recursive: true });
  assert.equal(app.relocateDatabase(dest).databasePath, join(dest, 'inventory.sqlite'));
  app.close();
  writeFileSync(config, '{broken');
  const damaged = start();
  assert.equal(damaged.info.databasePath, null);
  assert.throws(() => damaged.catalog.listTables(), CatalogError);
  assert.equal(damaged.openDatabase(source).databasePath, source);
  assert.equal(damaged.settings.getTheme(), 'dark');
});
