import { randomUUID } from 'node:crypto';
import {
  closeSync, constants, copyFileSync, fsyncSync, linkSync, lstatSync,
  openSync, statSync, unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { CatalogError } from '../../shared/catalogError.js';

export function absolutePath(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new CatalogError('Выберите полный путь на диске.');
  }
  return resolve(value);
}

function matchesFile(first, second) {
  return first && second && first.ino !== 0n && first.ino === second.ino && first.dev === second.dev;
}

export function sameFile(first, second) {
  if (!first || !second) return false;
  if (first === second) return true;
  const options = { bigint: true, throwIfNoEntry: false };
  try {
    return Boolean(matchesFile(statSync(first, options), statSync(second, options)));
  } catch {
    // The old disk can be offline or inaccessible while the user chooses a replacement.
    return false;
  }
}

function hasSidecars(target) {
  return ['-wal', '-shm', '-journal'].some(suffix => lstatSync(target + suffix, { throwIfNoEntry: false }));
}

function targetOccupied() {
  return new CatalogError('В этой папке уже есть inventory.sqlite или служебные файлы SQLite. Выберите другую папку или откройте существующую базу.');
}

export function snapshotDatabase(connection, target) {
  if (lstatSync(target, { throwIfNoEntry: false }) || hasSidecars(target)) throw targetOccupied();
  const temp = join(dirname(target), '.inventory-' + randomUUID() + '.tmp');
  const fd = openSync(temp, 'wx', 0o600);
  let copied = false;
  try {
    try {
      // The SQLite snapshot includes committed WAL pages, even while other readers keep the WAL open.
      connection.prepare('VACUUM INTO ?').run(temp);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      linkSync(temp, target);
    } catch (error) {
      if (error.code === 'EEXIST') throw error;
      // FAT/exFAT and some network drives do not support hard links.
      copyFileSync(temp, target, constants.COPYFILE_EXCL);
      copied = true;
    }
  } catch (error) {
    if (error.code === 'EEXIST') throw targetOccupied();
    throw error;
  } finally {
    unlinkSync(temp);
  }

  const created = lstatSync(target, { bigint: true });
  const discard = () => {
    const current = lstatSync(target, { bigint: true, throwIfNoEntry: false });
    if (matchesFile(created, current)) unlinkSync(target);
  };
  try {
    if (hasSidecars(target)) throw targetOccupied();
    if (copied) {
      const targetFd = openSync(target, 'r+');
      try { fsyncSync(targetFd); } finally { closeSync(targetFd); }
    }
  } catch (error) {
    discard();
    throw error;
  }
  return discard;
}
