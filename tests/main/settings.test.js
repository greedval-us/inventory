import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApplicationServices } from '../../src/main/createApplicationServices.js';
import { migrate } from '../../src/main/database/migrate.js';

test('сохраняет выбранную тему в профиле и читает её после перезапуска', t => {
  const userData = mkdtempSync(join(tmpdir(), 'inventory-settings-'));
  t.after(() => rmSync(userData, { recursive: true, force: true }));
  const options = { userData, name: 'Inventory', version: '0.1.0' };
  const first = createApplicationServices(options);
  try {
    assert.equal(first.settings.getTheme(), 'system');
    assert.equal(first.settings.setTheme('dark'), 'dark');
    assert.throws(() => first.settings.setTheme('unknown'));
    assert.deepEqual(first.info, {
      name: 'Inventory', version: '0.1.0', databasePath: join(userData, 'data', 'inventory.sqlite'),
    });
  } finally {
    first.close();
  }
  const second = createApplicationServices(options);
  try {
    assert.equal(second.settings.getTheme(), 'dark');
  } finally {
    second.close();
  }
});

test('миграция отклоняет чужую базу и сохраняет её схему', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE existing_data (name TEXT)');
    assert.throws(() => migrate(db), /Несовместимая база/);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0);
    assert.deepEqual(db.prepare('SELECT name FROM sqlite_schema').all().map(row => row.name), ['existing_data']);
  } finally {
    db.close();
  }
});
