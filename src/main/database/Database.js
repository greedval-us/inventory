import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrate } from './migrate.js';

export class Database {
  #connection;

  constructor(filePath) {
    this.filePath = filePath;
  }

  open() {
    if (this.#connection) return this.#connection;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const db = new DatabaseSync(this.filePath);
    try {
      db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
      migrate(db);
      db.exec('PRAGMA journal_mode = WAL');
      this.#connection = db;
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
