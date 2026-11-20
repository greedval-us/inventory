import { randomUUID } from 'node:crypto';
import { lstatSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CatalogError } from '../../shared/catalogError.js';
import { acceptsAttachment } from '../../shared/attachmentKinds.js';
import { createCatalog } from '../catalog/createCatalog.js';
import { listAttachments } from '../catalog/attachments.js';
import { absolutePath, sameFile } from '../database/databaseFiles.js';
import {
  checkedBlob, decodeState, draftPath, folderOf, objectPath, openFolder, readState, recoverDrafts, removeFile, requireId,
} from './storageFiles.js';
import { copyBlob, downloadTo } from './fileTransfers.js';
import { activeStorage, changeFolder } from './storageLocation.js';

function report(error, message) {
  if (error instanceof CatalogError) return error;
  if (error.code === 'ENOSPC') return new CatalogError('На диске недостаточно свободного места.');
  return new CatalogError(message);
}

function quietly(action) {
  // Interrupted cleanup is retried from the draft markers and the database deletion queue.
  try { action(); } catch (error) { console.warn('Inventory attachment cleanup:', error.message); }
}

function publicFile({ id, name, size }) { return { id, name, size }; }

export class AttachmentStorage {
  #database;
  #profile;
  #pending = new Map();
  #scanned = null;
  #active = 0;
  #moving = false;
  #closed = false;

  constructor(database, profile) {
    this.#database = database;
    this.#profile = profile;
    this.catalog = createCatalog(database, { resolveStaged: (id, owner) => this.#resolve(id, owner) });
  }

  assertIdle() {
    if (this.#active || this.#moving) throw new CatalogError('Дождитесь завершения копирования файлов.');
  }

  #folder(state, create = false) {
    const folder = folderOf(state);
    if (create && !lstatSync(folder, { throwIfNoEntry: false }) && listAttachments(this.#database.open()).length) {
      throw new CatalogError('Папка с вложениями недоступна. Подключите диск или восстановите папку из копии.');
    }
    openFolder(state, create);
    if (this.#scanned !== folder) {
      recoverDrafts(folder, () => new Set(listAttachments(this.#database.open()).map(file => file.id)));
      this.#scanned = folder;
    }
    return folder;
  }

  location() {
    try {
      const state = activeStorage(this.#database, true);
      if (sameFile(state.databasePath, this.#database.filePath)) this.sweep();
      return { folder: folderOf(state), custom: state.parent !== null };
    } catch (error) { throw report(error, 'Не удалось прочитать настройки папки вложений.'); }
  }

  async setFolder(path) {
    this.assertIdle();
    this.#moving = true;
    try {
      const drafts = [...this.#pending.values()];
      const unchanged = () => !this.#closed && drafts.length === this.#pending.size && drafts.every(file => this.#pending.get(file.id) === file);
      const next = await changeFolder(this.#database, path, drafts, unchanged);
      if (next) {
        for (const draft of drafts) {
          const old = draft.state;
          draft.state = next;
          quietly(() => this.#removeDraft(old, draft.id, true));
        }
      }
      return this.location();
    } catch (error) { throw report(error, 'Не удалось перенести вложения. Проверьте обе папки и права на запись.'); }
    finally { this.#moving = false; }
  }

  #resolve(id, { tableId, fieldKey, recordId }) {
    const item = this.#pending.get(id);
    if (!item || item.tableId !== tableId || item.fieldKey !== fieldKey || item.recordId !== (recordId ?? null)
      || item.state.id !== readState(this.#database)?.id) return null;
    checkedBlob(openFolder(item.state), item);
    return publicFile(item);
  }

  async stage({ tableId, fieldKey, recordId = null }, paths) {
    if (this.#moving) throw new CatalogError('Дождитесь переноса вложений.');
    const selected = [];
    this.#active++;
    try {
      const field = this.catalog.getFileField({ tableId, fieldKey });
      if (!Array.isArray(paths) || (recordId !== null && (!Number.isSafeInteger(recordId) || recordId < 1))) {
        throw new CatalogError('Не удалось определить запись для вложений.');
      }
      const state = activeStorage(this.#database);
      const folder = this.#folder(state, true);
      for (const path of paths) {
        const from = absolutePath(path);
        const name = basename(from);
        const stat = lstatSync(from);
        if (!stat.isFile() || !acceptsAttachment(field.fileKind, name)) throw new CatalogError('Файл не подходит для этого поля: ' + name);
        const id = randomUUID();
        const to = objectPath(folder, id);
        writeFileSync(draftPath(folder, id), '', { flag: 'wx' });
        const item = { id, name, size: stat.size, tableId, fieldKey, recordId, state };
        try { await copyBlob(from, to); } catch (error) {
          removeFile(draftPath(folder, id));
          throw error;
        }
        selected.push(item);
        item.size = lstatSync(to).size;
      }
      if (this.#closed) throw new CatalogError('Окно программы уже закрыто.');
      for (const file of selected) this.#pending.set(file.id, file);
      return selected.map(publicFile);
    } catch (error) {
      for (const item of selected) quietly(() => this.#removeDraft(item.state, item.id, true));
      throw report(error, 'Не удалось прикрепить файлы. Проверьте файлы и доступ к папке вложений.');
    } finally { this.#active--; }
  }

  #removeDraft(state, id, includeBlob) {
    const folder = openFolder(state);
    if (includeBlob) removeFile(objectPath(folder, id));
    removeFile(draftPath(folder, id));
  }

  discard(ids) {
    if (!Array.isArray(ids)) throw new CatalogError('Укажите выбранные вложения.');
    for (const id of ids) {
      const item = this.#pending.get(requireId(id));
      if (!item) continue;
      this.#pending.delete(id);
      quietly(() => this.#removeDraft(item.state, id, true));
    }
  }

  describe(id) {
    const file = this.#pending.get(requireId(id)) ?? this.catalog.getAttachment(id);
    if (!file) throw new CatalogError('Вложение не найдено.');
    return publicFile(file);
  }

  #filePath(file) {
    const state = this.#pending.get(file.id)?.state ?? activeStorage(this.#database);
    return checkedBlob(this.#folder(state), file);
  }

  photoSource(owner) {
    try {
      const file = this.catalog.getImageAttachment(owner);
      return { path: this.#filePath(file), size: file.size };
    } catch (error) { throw report(error, 'Не удалось прочитать изображение. Проверьте папку вложений.'); }
  }

  async download(id, path) {
    this.#active++;
    try {
      const item = this.describe(id);
      const source = this.#filePath(item);
      await downloadTo(source, path, this.#database.filePath, this.#profile);
    } catch (error) { throw report(error, 'Не удалось сохранить вложение. Проверьте путь и права на запись.'); }
    finally { this.#active--; }
  }

  saved(record) {
    for (const value of Object.values(record.values)) {
      if (!Array.isArray(value)) continue;
      for (const file of value) {
        const item = this.#pending.get(file.id);
        if (!item) continue;
        this.#pending.delete(item.id);
        quietly(() => this.#removeDraft(item.state, item.id, false));
      }
    }
  }

  sweep() {
    quietly(() => {
      const folders = new Map();
      for (const { id, storage } of this.catalog.listRemovedAttachments()) {
        if (!folders.has(storage)) {
          const state = storage && decodeState(storage);
          // A database snapshot can inherit its source's pending cleanup. The source still owns those files.
          if (!state || !sameFile(state.databasePath, this.#database.filePath)) folders.set(storage, null);
          else {
            try { folders.set(storage, openFolder(state)); }
            catch { folders.set(storage, false); } // Retry when this disk is available again.
          }
        }
        const folder = folders.get(storage);
        if (folder === false) continue;
        quietly(() => {
          if (folder) removeFile(objectPath(folder, id));
          this.catalog.forgetRemovedAttachment(id);
        });
      }
    });
  }

  reset() { this.discard([...this.#pending.keys()]); this.#scanned = null; }
  close() { this.#closed = true; this.reset(); }
}
