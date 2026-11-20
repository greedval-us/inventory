import { randomUUID } from 'node:crypto';
import {
  lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync,
  unlinkSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { CatalogError } from '../../shared/catalogError.js';
import { absolutePath, sameFile } from '../database/databaseFiles.js';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const validId = new RegExp('^' + uuid + '$');
const managedName = new RegExp('^Inventory-' + uuid + '$', 'i');
const draftName = new RegExp('^draft-(\\d+)-(' + uuid + ')$');
const marker = '.inventory-storage.json';
const key = 'attachmentStorage';

export function requireId(id) {
  if (typeof id !== 'string' || !validId.test(id)) throw new CatalogError('Некорректный идентификатор вложения.');
  return id;
}

export function newState(databasePath, parent = null) {
  return { id: randomUUID(), databasePath, parent };
}

export function readState(database) {
  const row = database.open().prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? decodeState(row.value) : null;
}

export function decodeState(encoded) {
  try {
    const { id, databasePath, parent } = JSON.parse(encoded);
    return { id: requireId(id), databasePath: absolutePath(databasePath), parent: parent === null ? null : absolutePath(parent) };
  } catch {
    throw new CatalogError('Повреждены настройки папки вложений этой базы.');
  }
}

export function writeState(database, state, initial = false) {
  const sql = initial ? 'INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)'
    : 'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value';
  database.open().prepare(sql).run(key, JSON.stringify(state));
}

export function folderOf(state, dbPath = state.databasePath) {
  return join(state.parent ?? join(dirname(dbPath), 'inventory-files'), 'Inventory-' + requireId(state.id));
}

export function insideManagedFolder(path) {
  let parent = path;
  while (parent !== dirname(parent)) {
    if (managedName.test(basename(parent))) return true;
    parent = dirname(parent);
  }
  return false;
}

function requireDirectory(folder) {
  const stat = lstatSync(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new CatalogError('Папка вложений недоступна или заменена ссылкой.');
}

function checkMarker(folder, state) {
  requireDirectory(dirname(folder));
  requireDirectory(folder);
  const file = join(folder, marker);
  const info = lstatSync(file);
  if (!info.isFile() || info.size > 65536) throw new CatalogError('Неверный служебный файл папки вложений.');
  const owner = JSON.parse(readFileSync(file, 'utf8'));
  if (owner.id !== state.id || !sameFile(owner.databasePath, state.databasePath)) {
    throw new CatalogError('Эта папка вложений принадлежит другой базе.');
  }
}

export function openFolder(state, create = false, candidate = folderOf(state)) {
  if (create && !state.parent) {
    try { mkdirSync(dirname(candidate)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  requireDirectory(dirname(candidate));
  if (create) {
    let created = false;
    try { mkdirSync(candidate); created = true; } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (created) {
      try {
        writeFileSync(join(candidate, marker), JSON.stringify({ id: state.id, databasePath: state.databasePath }), { flag: 'wx' });
      } catch (error) {
        try { rmdirSync(candidate); } catch {}
        throw error;
      }
    }
  }
  checkMarker(candidate, state);
  return candidate;
}

export function findStore(state, candidates) {
  for (const path of new Set(candidates)) {
    if (!path) continue;
    try { return openFolder(state, false, path); } catch {
      // A backup may have travelled with a relocated database or removable drive.
      // Only accept a directory with the recorded namespace and original owner marker.
    }
  }
  return null;
}

export function objectPath(folder, id) {
  return join(folder, requireId(id) + '.blob');
}

export function checkedBlob(folder, attachment) {
  const path = objectPath(folder, attachment.id);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size !== attachment.size) {
    throw new CatalogError('Файл вложения отсутствует или изменён: ' + attachment.name);
  }
  return path;
}

export function removeFile(path) {
  try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export function draftPath(folder, id) {
  return join(folder, 'draft-' + process.pid + '-' + requireId(id));
}

// A draft marker is written before copying bytes. After a crash, only reclaim drafts of exited
// processes, and consult committed attachment IDs before removing a blob.
export function recoverDrafts(folder, savedIds) {
  const abandoned = readdirSync(folder).map(name => [name, draftName.exec(name)]).filter(([, match]) => {
    if (!match) return false;
    try { process.kill(Number(match[1]), 0); return false; } catch (error) { return error.code === 'ESRCH'; }
  });
  if (!abandoned.length) return;
  const saved = savedIds();
  for (const [name, match] of abandoned) {
    if (!saved.has(match[2])) removeFile(objectPath(folder, match[2]));
    removeFile(join(folder, name));
  }
}

// Each transfer owns its fresh namespace. Rollback never enumerates or removes user files.
export function prepareCopy(source, state, saved, drafts) {
  const target = folderOf(state);
  if (lstatSync(target, { throwIfNoEntry: false })) throw new CatalogError('Папка вложений уже существует.');
  const parentExisted = Boolean(lstatSync(dirname(target), { throwIfNoEntry: false }));
  const created = [];
  openFolder(state, true);
  function* files() {
    for (const attachment of [...saved, ...drafts]) {
      const to = objectPath(target, attachment.id);
      yield [checkedBlob(source, attachment), to];
      created.push(to);
    }
    for (const { id } of drafts) {
      const draft = draftPath(target, id);
      writeFileSync(draft, '', { flag: 'wx' });
      created.push(draft);
    }
  }
  const rollback = () => {
    openFolder(state);
    for (const file of created) removeFile(file);
    removeFile(join(target, marker));
    const dirs = parentExisted ? [target] : [target, dirname(target)];
    for (const dir of dirs) {
      try { rmdirSync(dir); } catch (error) { if (error.code !== 'ENOTEMPTY') throw error; }
    }
  };
  return { files: files(), rollback };
}
