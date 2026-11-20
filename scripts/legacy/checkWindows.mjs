import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readSync, rmSync } from 'node:fs';
import { tmpdir, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { checkRegistry } from '../../tests/desktop/registry.mjs';
import { debugPipe } from './debugPipe.mjs';

const image = resolve(process.argv[2] || 'release/legacy/win-ia32-unpacked/Inventory.exe');
const archive = join(dirname(image), 'resources', 'app.asar');
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.INVENTORY_DEV_SERVER_URL;
delete environment.NODE_OPTIONS;

function readBytes(file, length, offset = 0) {
  const fd = openSync(file, 'r');
  try {
    const bytes = Buffer.alloc(length);
    assert.equal(readSync(fd, bytes, 0, length, offset), length, 'Truncated file: ' + file);
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function checkRuntime() {
  assert.equal(process.platform, 'win32', 'Run the smoke check on Windows.');
  const dos = readBytes(image, 64);
  assert.equal(dos.toString('ascii', 0, 2), 'MZ');
  const pe = readBytes(image, 26, dos.readUInt32LE(60));
  assert.equal(pe.toString('ascii', 0, 4), 'PE\0\0');
  assert.equal(pe.readUInt16LE(4), 0x14c, 'Expected a Windows i386 executable.');
  assert.equal(pe.readUInt16LE(24), 0x10b, 'Expected a PE32 executable.');
  assert.ok(existsSync(archive), 'Missing packaged application: ' + archive);
  const runtime = spawnSync(image, ['-p', 'JSON.stringify({arch:process.arch, node:process.versions.node})'], {
    env: { ...environment, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 15000,
  });
  if (runtime.error) throw runtime.error;
  assert.equal(runtime.status, 0, runtime.stderr);
  const { arch, node } = JSON.parse(runtime.stdout);
  assert.equal(arch, 'ia32');
  assert.match(node, /^16\./);
  return node;
}

async function until(description, read, timeout = 12000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await read();
    if (value) return value;
    await delay(60);
  } while (Date.now() < deadline);
  throw new Error('Timed out waiting for ' + description);
}

async function checkExportDialog(evaluate) {
  await evaluate(`[...document.querySelectorAll('nav a')].find(a => a.textContent.trim() === 'Жёсткие диски').click()`);
  const exportButton = 'document.querySelector(\'[data-action="export-excel"]\')';
  const confirm = 'document.querySelector(\'[data-action="confirm-export-excel"]:enabled\')';
  await until('the persistent disks section', () => evaluate(`document.querySelector('h1')?.textContent.trim() === 'Жёсткие диски'`));
  await evaluate(exportButton + '.click()');
  await until('export confirmation', () => evaluate('Boolean(' + confirm + ')'));
  assert.equal(await evaluate('document.querySelector(\'dialog input[name="exportMode"]:checked\').value'), 'all');
  await evaluate('document.querySelector("dialog .sheet-close").click()');
  await until('export dialog to close', () => evaluate('!document.querySelector("dialog[open]")'));
}

async function runPhase(profile, phase) {
  const child = spawn(image, ['--user-data-dir=' + profile, '--remote-debugging-pipe'], {
    env: environment, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  });
  const exited = new Promise((resolveExit, reject) => {
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
    child.once('error', reject);
  });
  const send = debugPipe(child);
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-6000); });
  async function exercise() {
    const { userAgent, product } = await send('Browser.getVersion');
    assert.match(product, /^Chrome\/108\./);
    assert.match(userAgent, / Electron\/22\./);
    const target = await until('packaged renderer in app.asar', async () => {
      const { targetInfos } = await send('Target.getTargets');
      return targetInfos.find(({ type, url }) => type === 'page' && url.startsWith('file:') &&
        fileURLToPath(url) === join(archive, 'build', 'renderer', 'index.html'));
    });
    const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    async function evaluate(expression) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true,
      }, sessionId);
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    }

    const settings = 'document.querySelector(\'a[href="#/settings"]\')';
    await until('renderer and production preload', () => evaluate('Boolean(window.inventory && ' + settings + ')'));
    assert.equal(await evaluate('typeof window.require'), 'undefined');
    const info = await evaluate('window.inventory.getInfo()');
    const databasePath = join(profile, 'data', 'inventory.sqlite');
    assert.equal(info.databasePath, databasePath, 'The application must use the isolated profile.');
    await evaluate(settings + '.click()');
    const radio = 'document.querySelector(\'input[name=theme][value="dark"]:enabled\')';
    await until('theme controls', () => evaluate('Boolean(' + radio + ')'));
    if (phase === 'initial') {
      assert.equal(await evaluate('window.inventory.getTheme()'), 'system');
      await evaluate(radio + '.click()');
    }
    await until('persisted dark theme', () => evaluate(radio + '?.checked && document.documentElement.dataset.theme === "dark"'));
    await until('painted dark background', () => evaluate('getComputedStyle(document.documentElement).backgroundColor === "rgb(24, 26, 32)"'));
    assert.equal(await evaluate('window.inventory.getTheme()'), 'dark');
    await checkRegistry({ webContents: { executeJavaScript: evaluate } }, phase);
    if (phase === 'restart') await checkExportDialog(evaluate);
    await send('Target.closeTarget', { targetId: target.targetId });
    const { code, signal } = await exited;
    assert.equal(code, 0, 'Inventory exit signal: ' + signal);
    const header = readBytes(databasePath, 100);
    assert.equal(header.toString('ascii', 0, 16), 'SQLite format 3\0');
    assert.equal(header.toString('ascii', 68, 72), 'INVT');
    console.log(phase + ' passed on ' + userAgent);
  }
  let timer;
  try {
    await Promise.race([exercise(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Packaged smoke timed out: ' + phase)), 60000);
    })]);
  } catch (error) {
    if (stderr) console.error(stderr);
    throw error;
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  }
}

const nodeVersion = checkRuntime();
const temporaryRoot = resolve(tmpdir());
const profile = mkdtempSync(join(temporaryRoot, 'inventory-legacy-'));
try {
  await runPhase(profile, 'initial');
  await runPhase(profile, 'restart');
  console.log('Legacy package passed on Windows ' + release() + ' (PE32/i386, Node ' + nodeVersion + ').');
} finally {
  assert.equal(dirname(profile), temporaryRoot);
  rmSync(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
}
