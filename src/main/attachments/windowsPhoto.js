import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import electron from 'electron';
import { CatalogError } from '../../shared/catalogError.js';

const run = promisify(execFile);
let command;
let active;

// Windows Imaging Component supplies TIFF and system-installed camera/HEIF codecs.
// Decode in a separate process and return only a screen-sized PNG to the viewer.
export async function decodeWindowsPhoto(filePath) {
  active?.abort();
  const controller = new AbortController();
  active = controller;
  try {
    const root = electron.app?.getAppPath() ?? process.cwd();
    command ??= Buffer.from(readFileSync(join(root, 'src/main/attachments/photoDecoder.ps1'), 'utf8'), 'utf16le').toString('base64');
    const shell = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const { stdout } = await run(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', command], {
      env: { ...process.env, INVENTORY_PREVIEW_INPUT: filePath },
      encoding: 'buffer', windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024, signal: controller.signal,
    });
    if (!stdout.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid PNG');
    return stdout;
  } catch {
    throw new CatalogError('Не удалось показать изображение. Проверьте файл и наличие кодека для этого формата в Windows.');
  } finally {
    if (active === controller) active = undefined;
  }
}
