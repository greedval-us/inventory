import { DatabaseSync } from 'node:sqlite';
import { closeSync, mkdirSync, openSync, readSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CatalogError } from '../../shared/catalogError.js';
import { APPLICATION_ID, migrate } from './migrate.js';

function existingDatabaseUri(filePath) {
  // Reject empty or unrelated files before SQLite can create a journal or shared memory.
  if (!statSync(filePath).isFile()) throw new CatalogError('Выберите файл базы Inventory.');
  const fd = openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(100);
    if (readSync(fd, header, 0, header.length, 0) !== header.length
      || header.toString('ascii', 0, 16) !== 'SQLite format 3\0' || header.readUInt32BE(68) !== APPLICATION_ID) {
      throw new CatalogError('Выберите файл базы Inventory.');
    }
  } finally {
    closeSync(fd);
  }
  const url = pathToFileURL(filePath);
  // Use an empty URI authority for Windows UNC paths, even on SQLite builds without ALLOW_URI_AUTHORITY.
  const filename = url.host ? 'file:////' + url.host + url.pathname : url.href;
  return filename + '?mode=rw';
}

export class Database {
  #connection;
  #existingOnly;

  constructor(filePath, existingOnly = false) {
    this.filePath = filePath;
    this.#existingOnly = existingOnly;
  }

  open(existingOnly = this.#existingOnly) {
    if (this.#connection) {
      this.#existingOnly = existingOnly;
      return this.#connection;
    }
    if (!existingOnly) mkdirSync(dirname(this.filePath), { recursive: true });
    const db = new DatabaseSync(existingOnly ? existingDatabaseUri(this.filePath) : this.filePath);
    try {
      db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
      migrate(db, existingOnly);
      db.exec('PRAGMA journal_mode = WAL');
      this.#connection = db;
      this.#existingOnly = existingOnly;
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  close() {
    this.#connection?.close();
    this.#connection = undefined;
  }
}
