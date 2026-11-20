import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { CatalogError } from '../../shared/catalogError.js';
import { listAttachments } from '../catalog/attachments.js';
import { absolutePath, sameFile } from '../database/databaseFiles.js';
import { copySnapshotStore, copyStore } from './fileTransfers.js';
import { findStore, folderOf, insideManagedFolder, newState, readState, writeState } from './storageFiles.js';

// VACUUM INTO preserves the original database. Fork its attachment namespace before switching
// so deleting a file in the new copy cannot invalidate a reference in the original.
export function prepareDatabase(selected, allowMissing = false) {
  let previous = readState(selected);
  if (!previous || sameFile(selected.filePath, previous.databasePath)) return;
  const db = selected.open();
  db.exec('BEGIN IMMEDIATE');
  let next;
  let rollback;
  try {
    previous = readState(selected);
    if (sameFile(selected.filePath, previous.databasePath)) { db.exec('COMMIT'); return; }
    next = newState(selected.filePath, previous.parent);
    const saved = listAttachments(db);
    if (saved.length) {
      const local = folderOf({ ...previous, parent: null }, selected.filePath);
      const source = findStore(previous, [local, folderOf(previous)]);
      if (!source) {
        if (allowMissing) { db.exec('COMMIT'); return; } // Settings can reconnect a copied attachment folder.
        throw new CatalogError('Папка вложений недоступна. Выберите папку с копией файлов в настройках.');
      }
      // An absolute custom path from another PC can be offline. Use the neighbouring backup instead.
      if (source === local && previous.parent && !sameFile(local, folderOf(previous))) next.parent = null;
      rollback = copySnapshotStore(source, next, saved);
    }
    writeState(selected, next);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    rollback?.();
    throw error;
  }
  return () => { writeState(selected, previous); rollback?.(); };
}

export function activeStorage(database, allowMissing = false) {
  let state = readState(database);
  if (!state) {
    writeState(database, newState(database.filePath), true);
    state = readState(database);
  } else if (!sameFile(state.databasePath, database.filePath)) {
    prepareDatabase(database, allowMissing);
    state = readState(database);
  }
  return state;
}

function sameAttachments(original, current) {
  // Blob IDs are immutable. Moving attachments between rows does not change the bytes to copy.
  if (original.length !== current.length) return false;
  const wanted = new Set(original.map(file => file.id));
  return current.every(file => wanted.has(file.id));
}

export async function changeFolder(database, path, drafts, draftsUnchanged) {
  const state = readState(database) ?? activeStorage(database);
  let parent = path === null ? null : realpathSync.native(absolutePath(path));
  const selectedStore = parent && basename(parent).toLowerCase() === basename(folderOf(state)).toLowerCase() ? parent : null;
  if (selectedStore) parent = dirname(selectedStore);
  const db = database.open();
  const saved = listAttachments(db);
  const sameOwner = sameFile(state.databasePath, database.filePath);
  const sameLocation = parent === state.parent || sameFile(parent, state.parent) || sameFile(selectedStore, folderOf(state));
  if (sameOwner && sameLocation && (!saved.length || findStore(state, [folderOf(state)]))) return null;
  if (parent && (!lstatSync(parent).isDirectory() || insideManagedFolder(parent))) {
    throw new CatalogError('Выберите обычную папку вне служебного каталога вложений.');
  }
  if (drafts.some(file => file.state.id !== state.id)) throw new CatalogError('Папка вложений уже изменилась. Закройте форму и повторите выбор.');
  const next = newState(database.filePath, parent);
  let source;
  if (saved.length || drafts.length) {
    const newBase = dirname(folderOf(next));
    source = findStore(state, [folderOf(state), join(newBase, basename(folderOf(state))), selectedStore,
      folderOf({ ...state, parent: null }, database.filePath)]);
    if (!source) throw new CatalogError('Исходная папка вложений недоступна. Выберите папку с копией файлов этой базы.');
  }
  // Keep the Electron main process available during large copies. A short write transaction checks
  // that all referenced blobs and drafts are still present before publishing the new location.
  const rollback = await copyStore(source, next, saved, drafts);
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (readState(database)?.id !== state.id || !sameAttachments(saved, listAttachments(db)) || !draftsUnchanged()) {
        throw new CatalogError('Вложения изменились во время копирования. Повторите выбор папки.');
      }
      writeState(database, next);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return next;
  } catch (error) { rollback(); throw error; }
}
