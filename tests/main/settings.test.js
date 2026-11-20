import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApplicationServices } from '../../src/main/createApplicationServices.js';
import { migrate } from '../../src/main/database/migrate.js';
import { DEFAULT_APPEARANCE } from '../../src/shared/settings.js';

test('сохраняет тему и оформление в профиле и читает настройки после перезапуска', t => {
  const userData = mkdtempSync(join(tmpdir(), 'inventory-settings-'));
  t.after(() => rmSync(userData, { recursive: true, force: true }));
  const options = { userData, name: 'Inventory', version: '0.1.0' };
  const first = createApplicationServices(options);
  try {
    assert.equal(first.settings.getTheme(), 'system');
    assert.equal(first.settings.setTheme('dark'), 'dark');
    assert.deepEqual(first.settings.getAppearance(), DEFAULT_APPEARANCE);
    const appearance = { fontSize: 16, fontFamily: 'harry-potter', primaryColor: '#9a4411', secondaryColor: null };
    assert.deepEqual(first.settings.setAppearance({ ...appearance, primaryColor: '#9A4411' }), appearance);
    for (const patch of [{ fontSize: 11 }, { fontSize: 17 }, { fontSize: 13.5 }, { fontFamily: 'other' },
      { primaryColor: 'red' }, { secondaryColor: '#fff' }, { custom: true }]) {
      assert.throws(() => first.settings.setAppearance({ ...appearance, ...patch }), TypeError);
    }
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
    assert.deepEqual(second.settings.getAppearance(), {
      fontSize: 16, fontFamily: 'harry-potter', primaryColor: '#9a4411', secondaryColor: null,
    });
    second.settings.setAppearance(DEFAULT_APPEARANCE);
    assert.deepEqual(second.settings.getAppearance(), DEFAULT_APPEARANCE);
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
