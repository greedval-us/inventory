import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const fixture = fileURLToPath(new URL('../tests/desktop/smoke.mjs', import.meta.url));
const temporaryRoot = resolve(tmpdir());
const profile = mkdtempSync(join(temporaryRoot, 'inventory-desktop-'));
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.INVENTORY_DEV_SERVER_URL;

try {
  for (const phase of [
    'initial', 'restart', 'layout', 'collections', 'structure', 'fieldSettings', 'typeConversion',
    'sorting', 'sortingRestart', 'sortingResetRestart', 'appearance', 'appearanceRestart',
    'widths', 'widthsRestart', 'copySection', 'copySectionRestart',
    'databaseRelocate', 'databaseReopen', 'databaseRestored', 'excelExport', 'collectionFilter',
    'attachments', 'attachmentsRestart', 'photoPreview', 'excelImport',
  ]) {
    const result = spawnSync(electron, [fixture, `--user-data-dir=${profile}`, phase], {
      env: environment,
      windowsHide: true,
      encoding: 'utf8',
      // Photo preview starts the Windows Imaging Component decoder twice.
      timeout: phase === 'photoPreview' ? 60000 : 30000,
    });
    const transcript = [`Electron: ${phase}`, result.stdout, result.stderr].join('\n');
    if (result.error) throw new Error(transcript, { cause: result.error });
    assert.equal(result.status, 0, transcript);
    assert.ok(result.stdout.includes(`SMOKE_OK ${phase}`), transcript);
  }
  const database = new DatabaseSync(join(profile, 'data', 'inventory.sqlite'), { readOnly: true });
  try {
    const theme = database.prepare("SELECT value FROM app_settings WHERE key = 'theme'").get();
    assert.equal(theme?.value, 'dark');
  } finally {
    database.close();
  }
  console.log('Electron smoke passed: UI → Pinia → IPC → SQLite, including a restart.');
} finally {
  assert.equal(dirname(profile), temporaryRoot);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
