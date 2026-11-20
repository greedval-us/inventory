import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { checkRegistry } from './registry.mjs';
import { checkLayout } from './layout.mjs';
import { checkCollections } from './collections.mjs';
import { checkCollectionFilter } from './collectionFilter.mjs';
import { checkSchemaEditing } from './schemaEditing.mjs';
import { checkDragSections } from './dragSections.mjs';
import { checkFieldSettings } from './fieldSettings.mjs';
import { checkTypeConversion } from './typeConversion.mjs';
import { checkSorting } from './sorting.mjs';
import { checkAppearance } from './appearance.mjs';
import { checkColumnWidths } from './columnWidths.mjs';
import { checkCopySection } from './copySection.mjs';
import { checkDatabaseLocation, databaseFiles, databasePhases } from './databaseLocation.mjs';
import { checkExcelExport } from './excelExport.mjs';
import { checkExcelImport } from './excelImport.mjs';
import { checkAttachments } from './attachments.mjs';
import { checkPhotoPreview } from './photoPreview.mjs';

const phase = process.argv.at(-1);
const profile = app.commandLine.getSwitchValue('user-data-dir');
assert.ok(profile, 'A temporary user data directory is required.');
app.setPath('userData', profile);
// When Electron starts a standalone fixture, its default app path is the fixture directory.
app.setAppPath(fileURLToPath(new URL('../../', import.meta.url)));

async function checkWindow(window) {
  const evaluate = (expression) => window.webContents.executeJavaScript(expression);
  async function waitFor(expression, timeout = 8000) {
    const deadline = Date.now() + timeout;
    do {
      if (await evaluate(expression)) return;
      await delay(50);
    } while (Date.now() < deadline);
    throw new Error(`Timed out waiting for ${expression}`);
  }

  await waitFor("Boolean(document.querySelector('a[href=\"#/settings\"]'))");
  assert.equal(await evaluate('typeof window.require'), 'undefined');
  const databasePath = join(resolve(profile), 'data', 'inventory.sqlite');
  const info = await evaluate('window.inventory.getInfo()');
  assert.equal(info.name, 'Inventory');
  assert.equal(info.databasePath, phase === 'databaseReopen' ? databaseFiles(profile).copy : databasePath);
  if (phase === 'excelImport') return checkExcelImport(window, evaluate, waitFor, profile);

  await evaluate("document.querySelector('a[href=\"#/settings\"]').click()");
  const themeControl = (value) => `document.querySelector('input[name="theme"][value="${value}"]:enabled')`;
  const previousTheme = phase === 'initial' ? 'system' : 'dark';
  await waitFor(`${themeControl(previousTheme)}?.checked`);
  assert.equal(await evaluate('window.inventory.getTheme()'), previousTheme);
  if (phase === 'initial') {
    await evaluate(`${themeControl('dark')}.click()`);
  }
  await waitFor("document.documentElement.dataset.theme === 'dark'");
  await waitFor(`${themeControl('dark')}?.checked`);
  assert.equal(await evaluate('window.inventory.getTheme()'), 'dark');
  if (phase === 'layout' || phase === 'collections') {
    await evaluate('document.querySelector(\'nav a[href="#/"]\').click()');
    await waitFor('document.querySelector(\'main h1\')?.textContent === "Все разделы"');
    if (phase === 'layout') return checkLayout(window, evaluate, waitFor);
    return checkCollections(window, evaluate, waitFor);
  }
  if (databasePhases.includes(phase)) return checkDatabaseLocation(window, evaluate, waitFor, profile, phase);
  if (phase === 'excelExport') return checkExcelExport(window, evaluate, waitFor, profile);
  if (phase === 'attachments' || phase === 'attachmentsRestart') return checkAttachments(window, evaluate, waitFor, profile, phase);
  if (phase === 'photoPreview') return checkPhotoPreview(window, evaluate, waitFor, profile);
  if (phase === 'collectionFilter') return checkCollectionFilter(window, evaluate, waitFor);
  if (phase.startsWith('sorting')) return checkSorting(window, evaluate, waitFor, phase);
  if (phase === 'copySection' || phase === 'copySectionRestart') return checkCopySection(evaluate, waitFor, phase);
  if (phase === 'widths' || phase === 'widthsRestart') return checkColumnWidths(window, evaluate, waitFor, phase);
  if (phase === 'appearance' || phase === 'appearanceRestart') return checkAppearance(window, evaluate, waitFor, phase);
  if (phase === 'fieldSettings') return checkFieldSettings(window, evaluate, waitFor);
  if (phase === 'typeConversion') return checkTypeConversion(window, evaluate, waitFor);
  if (phase === 'structure') {
    await checkSchemaEditing(window, evaluate, waitFor);
    await checkDragSections(window, evaluate, waitFor);
    return;
  }
  assert.ok(phase === 'initial' || phase === 'restart', 'Unknown desktop phase: ' + phase);
  await checkRegistry(window, phase);
}

app.once('browser-window-created', (_event, window) => {
  window.show = () => {};
  window.webContents.setBackgroundThrottling(false);
  window.webContents.once('did-finish-load', async () => {
    try {
      await checkWindow(window);
      console.log(`SMOKE_OK ${phase}`);
      app.quit();
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});

await import('../../src/main/index.js');
