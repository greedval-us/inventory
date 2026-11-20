import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { createApplicationServices } from '../../src/main/createApplicationServices.js';
import { createPhotoProtocol } from '../../src/main/windows/photoProtocol.js';
import { CatalogError } from '../../src/shared/catalogError.js';

function fixture(t) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'inventory-files-')));
  const instances = [];
  function start() {
    const services = createApplicationServices({ userData: join(root, 'profile'), name: 'Inventory', version: '1' });
    instances.push(services);
    return services;
  }
  function folder(name) {
    const directory = join(root, name);
    mkdirSync(directory);
    return directory;
  }
  t.after(() => {
    instances.forEach(app => app.close());
    rmSync(root, { recursive: true, force: true });
  });
  return { root, start, folder };
}

function setup(app) {
  const table = app.catalog.createTable({ name: 'Техника', fields: [{ type: 'files', fileKind: 'image', label: 'Фото' }] });
  return { tableId: table.id, fieldKey: table.fields[0].key };
}

test('просмотр принадлежит фото-полю и записи, включая несохранённые вложения', async t => {
  const { root, start } = fixture(t);
  const app = start();
  const table = app.catalog.createTable({ name: 'Раздел', fields: [
    { type: 'files', fileKind: 'image', label: 'Фото' },
    { type: 'files', fileKind: 'image', label: 'Обложка' },
    { type: 'files', fileKind: 'any', label: 'Файлы' },
  ] });
  const path = join(root, 'фото.png');
  writeFileSync(path, Buffer.from('89504e470d0a1a0a', 'hex'));
  const owner = { tableId: table.id, fieldKey: 'f_1', recordId: null };
  const files = { ...owner, fieldKey: 'f_3' };
  const [photo] = await app.attachments.stage(owner, [path]);
  const [download] = await app.attachments.stage(files, [path]);
  const window = { isDestroyed: () => false };
  const protocol = createPhotoProtocol(app, () => window);
  const read = url => protocol.respond({ url, method: 'GET' });
  const draft = { ...owner, id: photo.id };
  const draftUrl = protocol.preview(draft);
  assert.match(draftUrl, /^inventory-photo:\/\/preview\/[0-9a-f-]{36}$/);
  const response = await read(draftUrl);
  assert.equal(response.statusCode, 200);
  const chunks = [];
  for await (const chunk of response.data) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), readFileSync(path));
  const other = app.catalog.saveRecord({ tableId: table.id, values: {} });
  for (const invalid of [
    { ...draft, fieldKey: 'f_2' }, { ...draft, recordId: other.id },
    { ...files, id: download.id }, { ...draft, id: download.id },
  ]) assert.throws(() => protocol.preview(invalid), CatalogError);
  const stored = app.catalog.saveRecord({ tableId: table.id, values: { f_1: [photo], f_3: [download] } });
  assert.equal((await read(draftUrl)).statusCode, 404);
  assert.throws(() => protocol.preview(draft), CatalogError);
  const saved = { ...draft, recordId: stored.id };
  const url = protocol.preview(saved);
  assert.throws(() => protocol.preview({ ...saved, recordId: other.id }), CatalogError);
  assert.throws(() => protocol.preview({ ...saved, fieldKey: 'f_2' }), CatalogError);
  assert.throws(() => protocol.preview({ ...saved, fieldKey: 'f_3', id: download.id }), CatalogError);
  const anotherTable = app.catalog.createTable({ name: 'Другой раздел', fields: [{ type: 'files', fileKind: 'image', label: 'Фото' }] });
  assert.throws(() => protocol.preview({ ...saved, tableId: anotherTable.id }), CatalogError);
  app.catalog.updateTable({ id: table.id, name: table.name, fields: table.fields.map(field =>
    field.key === 'f_1' ? { ...field, fileKind: 'any' } : field) });
  assert.equal((await read(url)).statusCode, 404);
  assert.throws(() => protocol.preview(saved), CatalogError);
  await app.attachments.download(photo.id, join(root, 'копия.png'));
  assert.deepEqual(readFileSync(join(root, 'копия.png')), readFileSync(path));
});

test('ссылка просмотра ограничена окном, текущим фото и базой, формат определяется по содержимому', async t => {
  const { root } = fixture(t);
  let window = { isDestroyed: () => false };
  const path = join(root, 'upload.blob');
  let bytes;
  const services = {
    info: { databasePath: 'A.sqlite' },
    attachments: { photoSource: () => ({ path, size: bytes.length }) },
  };
  const protocol = createPhotoProtocol(services, () => window);
  const get = (url, method = 'GET') => protocol.respond({ url, method });
  bytes = Buffer.from('GIF89a');
  writeFileSync(path, bytes);
  const original = protocol.preview({});
  const active = protocol.preview({});
  assert.equal((await get(original)).statusCode, 404);
  assert.equal((await get(active, 'POST')).statusCode, 404);
  assert.equal((await get(active + '?other')).statusCode, 404);
  for (const [content, mime] of [
    ['GIF89a', 'image/gif'], [Buffer.from('ffd8ffe1', 'hex'), 'image/jpeg'],
    ['RIFF0000WEBP', 'image/webp'], ['<?xml version="1.0"?><!-- photo --><svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'],
    [Buffer.from('\ufeff<?xml version="1.0" encoding="UTF-16"?><svg/>', 'utf16le'), 'image/svg+xml'],
    [Buffer.from('00000018667479706d6966310000000061766966', 'hex'), 'image/avif'],
  ]) {
    bytes = Buffer.from(content);
    writeFileSync(path, bytes);
    const result = await get(active);
    assert.equal(result.statusCode, 200);
    assert.equal(result.headers['Content-Type'], mime);
    assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
    assert.match(result.headers['Content-Security-Policy'], /default-src 'none'/);
    const chunks = [];
    for await (const chunk of result.data) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), bytes);
  }
  for (const invalid of ['<html><svg/></html>', 'MZ', '<!-- unfinished <svg/>']) {
    bytes = Buffer.from(invalid);
    writeFileSync(path, bytes);
    assert.equal((await get(active)).statusCode, 415);
  }
  services.info.databasePath = 'B.sqlite';
  assert.equal((await get(active)).statusCode, 404);
  services.info.databasePath = 'A.sqlite';
  window = { isDestroyed: () => false };
  assert.equal((await get(active)).statusCode, 404);
});

test('несколько одноимённых файлов сохраняются, скачиваются и удаляются независимо', async t => {
  const { root, start, folder } = fixture(t);
  const app = start();
  const owner = setup(app);
  const sources = [join(folder('А'), 'Фото.PNG'), join(folder('Б'), 'Фото.PNG')];
  const contents = [Buffer.from([0,1,0,128]), Buffer.from([255,29])];
  sources.forEach((file, i) => writeFileSync(file, contents[i]));
  const selected = await app.attachments.stage(owner, sources);
  const directory = app.attachments.location();
  assert.equal(directory.custom, false);
  assert.equal(dirname(dirname(directory.folder)), dirname(app.info.databasePath));
  assert.deepEqual(selected.map(f => [f.name, f.size]), [['Фото.PNG', 4], ['Фото.PNG', 2]]);
  const record = app.catalog.saveRecord({ tableId: owner.tableId, values: { f_1: selected } });
  assert.deepEqual(record.values.f_1, selected);
  app.attachments.discard(selected.map(f => f.id)); // A late cancel cannot remove a committed file.
  app.close();
  const next = start();
  const target = join(root, 'скачано.png');
  for (const [i, file] of selected.entries()) {
    await next.attachments.download(file.id, target);
    assert.deepEqual(readFileSync(target), contents[i]);
  }
  const neighbour = join(directory.folder, 'Мои заметки.txt');
  writeFileSync(neighbour, 'Не трогать');
  for (const path of [next.info.databasePath, next.info.databasePath + '-wal', neighbour, join(root, 'profile', 'database-location.json')]) {
    await assert.rejects(next.attachments.download(selected[0].id, path), CatalogError);
  }
  next.catalog.saveRecord({ tableId: owner.tableId, id: record.id, values: { f_1: [selected[1].id] } });
  assert.equal(existsSync(join(directory.folder, selected[0].id + '.blob')), false);
  next.catalog.deleteRecord({ tableId: owner.tableId, id: record.id });
  assert.equal(existsSync(join(directory.folder, selected[1].id + '.blob')), false);
  assert.throws(() => next.attachments.describe(selected[1].id), CatalogError);
  assert.equal(readFileSync(neighbour, 'utf8'), 'Не трогать');
});

test('отмена, частичная ошибка выбора и неудачная запись не меняют сохранённые вложения', async t => {
  const { root, start } = fixture(t);
  const app = start();
  const owner = setup(app);
  const file = join(root, 'вид.png');
  const invalid = join(root, 'текст.txt');
  writeFileSync(file, 'one');
  writeFileSync(invalid, 'two');
  await assert.rejects(app.attachments.stage(owner, [file, invalid]), CatalogError);
  const { folder } = app.attachments.location();
  assert.deepEqual(readdirSync(folder), ['.inventory-storage.json']);
  const [item] = await app.attachments.stage(owner, [file]);
  assert.throws(() => app.catalog.saveRecord({ tableId: owner.tableId, values: { f_1: [item], extra: 'ошибка' } }), CatalogError);
  assert.deepEqual(app.attachments.describe(item.id), item);
  app.attachments.discard([item.id]);
  assert.deepEqual(readdirSync(folder), ['.inventory-storage.json']);
  await app.attachments.stage(owner, [file]);
  app.close();
  assert.deepEqual(readdirSync(folder), ['.inventory-storage.json']);
});

test('выбор папки, возврат к стандартной и перенос базы сохраняют вложения обеих копий', async t => {
  const { root, start, folder } = fixture(t);
  const app = start();
  const owner = setup(app);
  const source = join(root, 'фото.png');
  writeFileSync(source, 'содержимое');
  const [first] = await app.attachments.stage(owner, [source]);
  const { id } = app.catalog.saveRecord({ tableId: owner.tableId, values: { f_1: [first] } });
  const [second] = await app.attachments.stage({ ...owner, recordId: id }, [source]);
  const custom = folder('Общая папка');
  writeFileSync(join(custom, 'свой файл'), 'пользователь');
  const moved = await app.attachments.setFolder(custom);
  assert.equal(dirname(moved.folder), custom);
  assert.equal(moved.custom, true);
  app.catalog.saveRecord({ id, tableId: owner.tableId, values: { f_1: [first, second] } });
  const previous = app.info.databasePath;
  const movedDb = app.relocateDatabase(folder('Другой диск')).databasePath;
  const fork = app.attachments.location();
  assert.equal(dirname(fork.folder), custom);
  assert.notEqual(moved.folder, fork.folder);
  app.catalog.deleteTable({ id: owner.tableId });
  app.openDatabase(previous);
  for (const file of [first, second]) {
    await app.attachments.download(file.id, join(root, 'скачано'));
    assert.equal(readFileSync(join(root, 'скачано'), 'utf8'), 'содержимое');
  }
  const reset = await app.attachments.setFolder(null);
  assert.equal(reset.custom, false);
  const defaultCopy = app.relocateDatabase(folder('Локальная база')).databasePath;
  assert.equal(dirname(dirname(app.attachments.location().folder)), dirname(defaultCopy));
  await app.attachments.download(first.id, join(root, 'копия'));
  assert.equal(readFileSync(join(root, 'копия'), 'utf8'), 'содержимое');
  app.openDatabase(movedDb);
  assert.throws(() => app.attachments.describe(first.id), CatalogError);
  assert.equal(readFileSync(join(custom, 'свой файл'), 'utf8'), 'пользователь');
});

test('ручная копия базы получает собственную папку и не удаляет оригинальные файлы', async t => {
  const { root, start, folder } = fixture(t);
  const app = start();
  const owner = setup(app);
  const upload = join(root, 'файл.gif');
  writeFileSync(upload, 'GIF');
  const [file] = await app.attachments.stage(owner, [upload]);
  const record = app.catalog.saveRecord({ tableId: owner.tableId, values: { f_1: [file] } });
  const original = app.info.databasePath;
  const originalStore = app.attachments.location();
  app.close();
  const copy = join(folder('Копия'), 'inventory-copy.sqlite');
  copyFileSync(original, copy);
  const next = start();
  next.openDatabase(copy);
  assert.notEqual(next.attachments.location().folder, originalStore.folder);
  next.catalog.deleteRecord({ tableId: owner.tableId, id: record.id });
  next.openDatabase(original);
  const result = join(root, 'сохранено.gif');
  await next.attachments.download(file.id, result);
  assert.equal(readFileSync(result, 'utf8'), 'GIF');
});

test('восстанавливает вложения на новом компьютере из соседней папки или выбранной копии', async t => {
  const { root, start, folder } = fixture(t);
  const original = start();
  const owner = setup(original);
  const custom = folder('Старый архив');
  const previous = await original.attachments.setFolder(custom);
  const file = join(root, 'скриншот.png');
  writeFileSync(file, 'image');
  const [item] = await original.attachments.stage(owner, [file]);
  original.catalog.saveRecord({ tableId: owner.tableId, values: { f_1: [item] } });
  const database = original.info.databasePath;
  original.close();
  const backup = folder('Новый компьютер');
  const localBackup = folder('База с соседней папкой');
  copyFileSync(database, join(backup, 'база.db'));
  copyFileSync(database, join(localBackup, 'база.db'));
  cpSync(previous.folder, join(localBackup, 'inventory-files', basename(previous.folder)), { recursive: true });
  renameSync(custom, custom + '-копия');
  renameSync(database, database + '-offline');
  const restored = start();
  const recovered = join(root, 'результат.png');
  restored.openDatabase(join(backup, 'база.db'));
  assert.equal(restored.catalog.listTables().length, 1);
  assert.equal(restored.attachments.location().custom, true);
  await assert.rejects(restored.attachments.download(item.id, recovered), CatalogError);
  // The user can choose the copied private folder itself as well as its parent.
  await restored.attachments.setFolder(join(custom + '-копия', basename(previous.folder)));
  await restored.attachments.download(item.id, recovered);
  assert.equal(readFileSync(recovered, 'utf8'), 'image');
  restored.openDatabase(join(localBackup, 'база.db'));
  assert.equal(restored.attachments.location().custom, false);
  await restored.attachments.download(item.id, recovered);
  assert.equal(readFileSync(recovered, 'utf8'), 'image');
});

test('сбой копирования оставляет прежнее хранилище и файлы пользователя на месте', async t => {
  const { root, start, folder } = fixture(t);
  const app = start();
  const owner = setup(app);
  const file = join(root, 'фото.png');
  writeFileSync(file, 'image');
  const [first, second] = await app.attachments.stage(owner, [file, file]);
  app.catalog.saveRecord({ tableId: owner.tableId, values: { f_1: [first, second] } });
  const source = app.attachments.location();
  const missing = join(source.folder, second.id + '.blob');
  renameSync(missing, missing + '.backup');
  const destination = folder('Новая папка');
  writeFileSync(join(destination, 'чужой файл'), 'данные');
  await assert.rejects(app.attachments.setFolder(destination), CatalogError);
  assert.deepEqual(app.attachments.location(), source);
  assert.deepEqual(readdirSync(destination), ['чужой файл']);
  renameSync(missing + '.backup', missing);
  await app.attachments.setFolder(destination);
  assert.notEqual(app.attachments.location().folder, source.folder);
});

test('отключённый диск можно сменить после удаления последнего файла, очистка повторяется при подключении', async t => {
  const { root, start, folder } = fixture(t);
  const app = start();
  const owner = setup(app);
  const removable = folder('Съёмный диск');
  const previous = await app.attachments.setFolder(removable);
  const image = join(root, 'вид.png');
  writeFileSync(image, 'image');
  const [file] = await app.attachments.stage(owner, [image]);
  const record = app.catalog.saveRecord({ tableId: owner.tableId, values: { f_1: [file] } });
  renameSync(removable, removable + '-offline');
  app.catalog.deleteRecord({ tableId: owner.tableId, id: record.id });
  await app.attachments.setFolder(null);
  assert.deepEqual(app.catalog.listRemovedAttachmentIds(), [file.id]);
  assert.equal(existsSync(removable), false);
  const [newFile] = await app.attachments.stage(owner, [image]);
  const another = app.catalog.saveRecord({ tableId: owner.tableId, values: { f_1: [newFile] } });
  app.catalog.deleteRecord({ tableId: owner.tableId, id: another.id });
  assert.deepEqual(app.catalog.listRemovedAttachmentIds(), [file.id]);
  assert.equal(existsSync(join(app.attachments.location().folder, newFile.id + '.blob')), false);
  renameSync(removable + '-offline', removable);
  assert.ok(existsSync(join(previous.folder, file.id + '.blob')));
  app.attachments.location();
  app.attachments.location();
  assert.deepEqual(app.catalog.listRemovedAttachmentIds(), []);
  assert.equal(existsSync(join(previous.folder, file.id + '.blob')), false);
});

test('перенос обрабатывает изменение вложений во время фонового копирования', async t => {
  const { root, start, folder } = fixture(t);
  const app = start();
  const owner = setup(app);
  const image = join(root, 'кадр.png');
  writeFileSync(image, 'image');
  const [file] = await app.attachments.stage(owner, [image]);
  const record = app.catalog.saveRecord({ tableId: owner.tableId, values: { f_1: [file] } });
  const previous = app.attachments.location();
  const destination = folder('Другая папка');
  const change = app.attachments.setFolder(destination);
  app.catalog.deleteRecord({ tableId: owner.tableId, id: record.id });
  await assert.rejects(change, CatalogError);
  assert.deepEqual(app.attachments.location(), previous);
  assert.deepEqual(readdirSync(destination), []);
  await app.attachments.setFolder(destination);
  assert.equal(dirname(app.attachments.location().folder), destination);
});
