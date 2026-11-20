import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, constants, copyFileSync, fsyncSync, lstatSync, openSync, realpathSync } from 'node:fs';
import { chmod, copyFile, open, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { CatalogError } from '../../shared/catalogError.js';
import { absolutePath, sameFile } from '../database/databaseFiles.js';
import { insideManagedFolder, prepareCopy, removeFile } from './storageFiles.js';

export async function copyBlob(from, to) {
  await copyFile(from, to, constants.COPYFILE_EXCL);
  try {
    await chmod(to, 0o600);
    const handle = await open(to, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
  } catch (error) { removeFile(to); throw error; }
}

export async function copyStore(source, state, saved, drafts) {
  const plan = prepareCopy(source, state, saved, drafts);
  try {
    for (const [from, to] of plan.files) await copyBlob(from, to);
    return plan.rollback;
  } catch (error) { plan.rollback(); throw error; }
}

// Relocating an SQLite snapshot is synchronous. All bytes must be durable before its new path is published.
export function copySnapshotStore(source, state, saved) {
  const plan = prepareCopy(source, state, saved, []);
  try {
    for (const [from, to] of plan.files) {
      copyFileSync(from, to, constants.COPYFILE_EXCL);
      try {
        chmodSync(to, 0o600);
        const fd = openSync(to, 'r+');
        try { fsyncSync(fd); } finally { closeSync(fd); }
      } catch (error) { removeFile(to); throw error; }
    }
    return plan.rollback;
  } catch (error) { plan.rollback(); throw error; }
}

function destination(path, databasePath, profile) {
  const target = absolutePath(path);
  const dir = realpathSync.native(dirname(target));
  const name = basename(target);
  const result = join(dir, name);
  const protectedFiles = [databasePath, databasePath + '-wal', databasePath + '-shm', databasePath + '-journal',
    join(profile, 'database-location.json')];
  const existing = lstatSync(result, { throwIfNoEntry: false });
  const invalidName = process.platform === 'win32' && /[:<>|?*"\\/]|[. ]$|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
  if (!name || invalidName || insideManagedFolder(dir) || (existing && !existing.isFile()) || protectedFiles.some(file =>
    sameFile(file, result) || (process.platform === 'win32' && file.toLowerCase() === result.toLowerCase()))) {
    throw new CatalogError('Выберите отдельный файл вне служебных файлов Inventory.');
  }
  return result;
}

export async function downloadTo(source, path, databasePath, profile) {
  const target = destination(path, databasePath, profile);
  const temporary = join(dirname(target), '.inventory-' + randomUUID() + '.tmp');
  await copyBlob(source, temporary);
  try {
    destination(target, databasePath, profile);
    await rename(temporary, target);
  } finally { removeFile(temporary); }
}
