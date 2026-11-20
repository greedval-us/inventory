import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { checkRegistry } from './registry.mjs';
import { checkLayout } from './layout.mjs';
import { checkCollections } from './collections.mjs';
import { checkSchemaEditing } from './schemaEditing.mjs';
import { checkDragSections } from './dragSections.mjs';
import { checkFieldSettings } from './fieldSettings.mjs';
import { checkTypeConversion } from './typeConversion.mjs';
import { checkSorting } from './sorting.mjs';
import { checkAppearance } from './appearance.mjs';
import { checkColumnWidths } from './columnWidths.mjs';

const phase = process.argv.at(-1);
const profile = app.commandLine.getSwitchValue('user-data-dir');
assert.ok(profile, 'A temporary user data directory is required.');
app.setPath('userData', profile);
// When Electron starts a standalone fixture, its default app path is the fixture directory.
app.setAppPath(fileURLToPath(new URL('../../', import.meta.url)));

async function checkWindow(window) {
  const evaluate = (expression) => window.webContents.executeJavaScript(expression);
  async function waitFor(expression) {
    const deadline = Date.now() + 8000;
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
  assert.equal(info.databasePath, databasePath);

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
  if (phase.startsWith('sorting')) return checkSorting(window, evaluate, waitFor, phase);
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
  if (phase === 'restart') {
    await checkLayout(window, evaluate, waitFor);
    await checkCollections(window, evaluate, waitFor);
  }
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
