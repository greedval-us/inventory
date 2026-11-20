import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CatalogError } from '../../shared/catalogError.js';
import { Database } from './Database.js';
import { absolutePath, sameFile, snapshotDatabase } from './databaseFiles.js';

function locationError(error, message) {
  return error instanceof CatalogError ? error : new CatalogError(message);
}

function saveLocation(settingsPath, databasePath) {
  mkdirSync(dirname(settingsPath), { recursive: true });
  const temp = settingsPath + '.' + randomUUID() + '.tmp';
  try {
    const fd = openSync(temp, 'wx', 0o600);
    try {
      writeFileSync(fd, JSON.stringify({ databasePath }));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, settingsPath);
  } catch (error) {
    if (error.code !== 'EEXIST') rmSync(temp, { force: true });
    throw new CatalogError('Не удалось сохранить выбранный путь в профиле приложения.');
  }
}

export class DatabaseLocation {
  #database;
  #settingsPath;
  #explicit = false;

  constructor(userData) {
    this.#settingsPath = join(userData, 'database-location.json');
    try {
      const settings = JSON.parse(readFileSync(this.#settingsPath, 'utf8'));
      this.#database = new Database(absolutePath(settings.databasePath), true);
      this.#explicit = true;
    } catch (error) {
      if (error.code === 'ENOENT' && !lstatSync(this.#settingsPath, { throwIfNoEntry: false })) {
        this.#database = new Database(join(userData, 'data', 'inventory.sqlite'));
      }
      // A damaged or inaccessible setting must not cause the app to create a new, empty database.
    }
  }

  get filePath() {
    return this.#database?.filePath ?? null;
  }

  open() {
    if (!this.#database) throw new CatalogError('Не удалось прочитать путь к базе. Выберите файл Inventory в настройках.');
    try {
      return this.#database.open();
    } catch (error) {
      throw locationError(error, 'Не удалось открыть базу Inventory. Проверьте доступ к диску или выберите другой файл в настройках.');
    }
  }

  openFile(filePath, prepare) {
    try {
      const target = realpathSync.native(absolutePath(filePath));
      if (sameFile(this.filePath, target)) {
        this.#database.open(true);
        if (!this.#explicit) {
          saveLocation(this.#settingsPath, this.filePath);
          this.#explicit = true;
        }
        return;
      }
      this.#switchTo(target, prepare);
    } catch (error) {
      throw locationError(error, 'Не удалось открыть выбранный файл Inventory. Проверьте файл и права на запись.');
    }
  }

  relocate(folder, prepare) {
    try {
      const target = join(realpathSync.native(absolutePath(folder)), 'inventory.sqlite');
      const connection = this.open();
      if (sameFile(this.filePath, target)) return;
      const discard = snapshotDatabase(connection, target);
      try {
        this.#switchTo(target, prepare);
      } catch (error) {
        discard();
        throw error;
      }
    } catch (error) {
      throw locationError(error, 'Не удалось скопировать базу. Проверьте свободное место на диске и права на запись в папку.');
    }
  }

  #switchTo(target, prepare) {
    if (sameFile(this.#settingsPath, target)) throw new CatalogError('Выберите файл базы Inventory.');
    const selected = new Database(target, true);
    let rollback;
    try {
      selected.open();
      rollback = prepare?.(selected);
      this.#database?.close();
      saveLocation(this.#settingsPath, target);
    } catch (error) {
      try { rollback?.(); } finally { selected.close(); }
      throw error;
    }
    this.#database = selected;
    this.#explicit = true;
  }

  close() {
    this.#database?.close();
  }
}
