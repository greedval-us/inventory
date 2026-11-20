import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Database } from '../../src/main/database/Database.js';
import { migrations } from '../../src/main/database/migrations.js';
import { createCatalog } from '../../src/main/catalog/createCatalog.js';
import { CatalogError } from '../../src/shared/catalogError.js';

function fixture(t) {
  const path = mkdtempSync(join(tmpdir(), 'inventory-catalog-'));
  const db = new Database(join(path, 'inventory.sqlite'));
  t.after(() => {
    db.close();
    rmSync(path, { recursive: true, force: true });
  });
  return { db, catalog: createCatalog(db) };
}

test('обновляет существующий профиль, автоматически создаёт независимые SQL-имена и сохраняет типы', t => {
  const { db, catalog } = fixture(t);
  const old = new DatabaseSync(db.filePath);
  old.exec(migrations[0]);
  old.exec("UPDATE app_settings SET value='dark' WHERE key='theme'; PRAGMA application_id=0x494e5654; PRAGMA user_version=1");
  old.close();
  const name = 'Оборудование «цех №1»';
  const definition = {
    name,
    fields: [
      { label: 'Инв. №', type: 'text' }, { label: 'Цена, ₽', type: 'number' },
      { label: 'Получено', type: 'date' }, { label: 'Выдано?', type: 'checkbox' },
      { label: 'Склад', type: 'select', options: ['Первый', 'Второй'] },
    ],
  };
  const table = catalog.createTable(definition);
  const keys = table.fields.map(field => field.key);
  assert.deepEqual(keys, ['f_1', 'f_2', 'f_3', 'f_4', 'f_5']);
  const columns = db.open().prepare('PRAGMA table_info(inventory_1)').all();
  assert.deepEqual(columns.map(column => column.name), ['id', ...keys]);
  const record = catalog.saveRecord({ tableId: table.id, values: {
    f_1: '001', f_2: '12,50', f_3: '2024-02-29', f_4: false, f_5: 'Первый',
  } });
  assert.deepEqual(record.values, { f_1: '001', f_2: 12.5, f_3: '2024-02-29', f_4: false, f_5: 'Первый' });
  db.close();
  assert.deepEqual(catalog.listTables(), [table]);
  assert.deepEqual(catalog.searchRecords(), { total: 1, rows: [record] });
  assert.equal(db.open().prepare('SELECT value FROM app_settings').get().value, 'dark');
  assert.throws(() => catalog.createTable({ ...definition, name: name.toUpperCase() }), CatalogError);
  assert.throws(() => catalog.createTable({ name: 'А', fields: [
    { label: 'Имя', type: 'text' }, { label: ' имя ', type: 'number' },
  ] }), CatalogError);
  assert.equal(catalog.listTables().length, 1);
});

test('общий поиск учитывает разные схемы, введённые пользователем метки, регистр и пустые поля', t => {
  const { catalog } = fixture(t);
  const tools = catalog.createTable({ name: 'Инструменты', fields: [
    { label: 'Описание', type: 'text' }, { label: 'На складе', type: 'checkbox' },
  ] });
  const books = catalog.createTable({ name: 'Книги', fields: [
    { label: 'ISBN', type: 'text' }, { label: 'описание', type: 'text' },
  ] });
  const first = catalog.saveRecord({ tableId: tools.id, values: { f_1: 'Съёмник 100%', f_2: false } });
  const second = catalog.saveRecord({ tableId: books.id, values: { f_1: '10_01', f_2: 'СЪЁМНИК деталей' } });
  const blank = catalog.saveRecord({ tableId: tools.id, values: {} });
  assert.deepEqual(catalog.searchRecords({ field: '  ОПИСАНИЕ ', query: 'съёмник' }).rows, [second, first]);
  assert.deepEqual(catalog.searchRecords({ tableId: tools.id, query: 'СЪЁМ' }).rows, [first]);
  assert.deepEqual(catalog.searchRecords({ query: '%' }).rows, [first]);
  assert.deepEqual(catalog.searchRecords({ query: '_' }).rows, [second]);
  assert.deepEqual(catalog.searchRecords({ query: 'НЕТ', field: 'на складе' }).rows, [first]);
  assert.deepEqual(catalog.searchRecords({ field: 'На складе' }).rows, [blank, first]);
  assert.deepEqual(catalog.searchRecords({ limit: 1, offset: 1 }), { total: 3, rows: [second] });
});

test('поиск по всем разделам находит текст в разных полях и в названии раздела', t => {
  const { catalog } = fixture(t);
  const disks = catalog.createTable({ name: 'Жёсткие диски', fields: [{ label: 'Модель', type: 'text' }] });
  const docs = catalog.createTable({ name: 'Документы', fields: [{ label: 'Примечание', type: 'text' }] });
  const disk = catalog.saveRecord({ tableId: disks.id, values: { f_1: 'Север-50' } });
  const doc = catalog.saveRecord({ tableId: docs.id, values: { f_1: 'Для филиала СЕВЕР' } });
  const otherDisk = catalog.saveRecord({ tableId: disks.id, values: { f_1: 'Юг-10' } });

  assert.deepEqual(catalog.searchRecords({ query: 'север' }), { total: 2, rows: [doc, disk] });
  assert.deepEqual(catalog.searchRecords({ query: ' ЁСТКИЕ ' }), { total: 2, rows: [otherDisk, disk] });
  assert.deepEqual(catalog.searchRecords({ query: 'диски', limit: 1, offset: 1 }), { total: 2, rows: [disk] });
  assert.deepEqual(catalog.searchRecords({ field: 'Модель', query: 'диски' }).rows, []);
  assert.deepEqual(catalog.searchRecords({ tableId: disks.id, query: 'диски' }).rows, []);
});

test('группы сохраняют схемы, ищут вхождения и перелистываются независимо', t => {
  const { catalog } = fixture(t);
  const disks = catalog.createTable({ name: 'Диски', fields: [{ label: 'Объём', type: 'number' }] });
  const docs = catalog.createTable({ name: 'Документы', fields: [{ label: 'Код', type: 'text' }] });
  const empty = catalog.createTable({ name: 'Кабели', fields: [{ label: 'Марка', type: 'text' }] });
  const numbers = [12450, 245, 3245].map(value => catalog.saveRecord({ tableId: disks.id, values: { f_1: value } }));
  const document = catalog.saveRecord({ tableId: docs.id, values: { f_1: 'Акт-245-Б' } });
  const unrelated = catalog.saveRecord({ tableId: docs.id, values: { f_1: 'Акт-24-Б' } });
  const groups = catalog.searchRecordGroups({ query: '245', limit: 2 });
  assert.deepEqual(groups, [
    { tableId: disks.id, total: 3, offset: 0, rows: [numbers[2], numbers[1]] },
    { tableId: docs.id, total: 1, offset: 0, rows: [document] },
    { tableId: empty.id, total: 0, offset: 0, rows: [] },
  ]);
  const last = catalog.searchRecordGroups({ query: '245', limit: 2, offsets: { [disks.id]: 22, [empty.id]: 20 } });
  assert.deepEqual(last, [{ tableId: disks.id, total: 3, offset: 2, rows: [numbers[0]] }, ...groups.slice(1)]);
  assert.deepEqual(catalog.searchRecordGroups({ query: '245', field: 'код' }).map(g => g.total), [0, 1, 0]);
  assert.deepEqual(catalog.searchRecordGroups({ query: 'докум' })[1].rows, [unrelated, document]);
  assert.deepEqual(catalog.searchRecordGroups().map(g => g.total), [3, 2, 0]);
  assert.throws(() => catalog.searchRecordGroups({ offsets: { [disks.id]: -1 } }), CatalogError);
});

test('редактирование и удаление синхронизируют типизированные данные и поиск', t => {
  const { catalog, db } = fixture(t);
  const table = catalog.createTable({ name: 'Кабели', fields: [
    { label: 'Марка', type: 'text' }, { label: 'Длина', type: 'number' },
    { label: 'Дата', type: 'date' }, { label: 'Цвет', type: 'select', options: ['Синий'] },
  ] });
  const other = catalog.createTable({ name: 'Прочее', fields: [{ label: 'Название', type: 'text' }] });
  const { id } = catalog.saveRecord({ tableId: table.id, values: { f_1: 'АВБ', f_2: 10 } });
  for (const values of [{ f_2: 'буквы' }, { f_3: '2025-02-29' }, { f_4: 'Жёлтый' }, { name: 'чужой ключ' }]) {
    assert.throws(() => catalog.saveRecord({ tableId: table.id, id, values }), CatalogError);
  }
  const edited = catalog.saveRecord({ tableId: table.id, id, values: { f_1: 'ВВГ' } });
  assert.equal(edited.values.f_2, 10);
  assert.equal(catalog.searchRecords({ query: 'АВБ' }).total, 0);
  assert.deepEqual(catalog.searchRecords({ query: 'ввг' }).rows, [edited]);
  assert.throws(() => catalog.deleteRecord({ tableId: other.id, id }), CatalogError);
  catalog.deleteRecord({ tableId: table.id, id });
  assert.equal(catalog.searchRecords().total, 0);
  assert.equal(db.open().prepare('SELECT count(*) AS n FROM inventory_1').get().n, 0);
  assert.throws(() => catalog.saveRecord({ tableId: table.id, id, values: { f_1: 'ВВГ' } }), CatalogError);
});

test('миграция разделов с записями сохраняет SQL-имена, а переименование сразу обновляет поиск', t => {
  const { db, catalog } = fixture(t);
  const old = new DatabaseSync(db.filePath);
  old.exec(migrations[0]);
  old.exec(migrations[1]);
  old.exec(`
    PRAGMA application_id = 0x494e5654;
    PRAGMA user_version = 2;
    INSERT INTO catalog_tables VALUES (17, 'Бумаги', 'бумаги', '[{"label":"Код","type":"text","key":"f_1"}]');
    INSERT INTO catalog_records VALUES (3, 17, '{"код":"акт-245"}');
    CREATE TABLE inventory_17 (id INTEGER PRIMARY KEY REFERENCES catalog_records(id) ON DELETE CASCADE, f_1 TEXT) STRICT;
    INSERT INTO inventory_17 VALUES (3, 'Акт-245');
  `);
  old.close();
  const [original] = catalog.listTables();
  const [record] = catalog.searchRecords({ query: '245' }).rows;
  assert.equal(original.description, '');
  assert.equal(original.collectionId, null);
  assert.equal(record.values.f_1, 'Акт-245');
  const collection = catalog.saveCollection({ name: 'Учёт', tableIds: [] });
  const renamed = catalog.updateTable({ id: 17, name: ' Документы ', collectionId: collection.id });
  assert.deepEqual(renamed, { ...original, name: 'Документы', collectionId: collection.id });
  db.close();
  assert.deepEqual(catalog.listTables(), [renamed]);
  assert.deepEqual(catalog.searchRecords({ query: 'документ' }).rows, [record]);
  assert.deepEqual(catalog.searchRecordGroups({ query: 'бумаги' })[0].rows, []);
  assert.deepEqual(catalog.searchRecords({ query: '245' }).rows, [record]);
  const second = catalog.copyTableStructure({ sourceId: original.id, name: 'Отчёты' });
  assert.ok(second.id > original.id);
  assert.equal(second.collectionId, collection.id);
  assert.deepEqual(second.fields, original.fields);
  assert.equal(catalog.searchRecords({ tableId: second.id }).total, 0);
  assert.throws(() => catalog.updateTable({ id: 17, name: '  отчёты', collectionId: null }), CatalogError);
  assert.throws(() => catalog.updateTable({ id: 17, name: 'Ошибка', collectionId: 999 }), CatalogError);
  assert.deepEqual(catalog.listTables()[0], renamed);
  const extended = catalog.updateTable({ id: 17, fields: [...renamed.fields, { label: 'Архив', type: 'checkbox' }] });
  assert.deepEqual(extended.fields.map(field => field.key), ['f_1', 'f_2']);
  catalog.updateTable({ id: 17, fields: [extended.fields[0]] });
  db.close();
  const restored = catalog.updateTable({ id: 17, fields: [...renamed.fields, { label: 'Состояние', type: 'text' }] });
  assert.deepEqual(restored.fields.map(field => field.key), ['f_1', 'f_3']);
  assert.deepEqual(catalog.searchRecords({ query: '245' }).rows[0].values, { f_1: 'Акт-245', f_3: null });
});

test('сохраняет многострочное описание раздела и независимо изменяет описание копии', t => {
  const { db, catalog } = fixture(t);
  const fields = [{ type: 'text', label: 'Код' }];
  const originalText = 'Ответственный: склад.\n\nУчитывать диски и адаптеры.';
  const source = catalog.createTable({ name: 'Техника', description: originalText, fields });
  const record = catalog.saveRecord({ tableId: source.id, values: { f_1: 'SSD-245' } });
  assert.equal(source.description, originalText);
  const copy = catalog.copyTableStructure({ sourceId: source.id, name: 'Резерв' });
  assert.equal(copy.description, originalText);
  const edited = catalog.updateTable({ id: source.id, description: '  Архив\nза январь.  ' });
  assert.equal(edited.description, 'Архив\nза январь.');
  assert.deepEqual(edited.fields, source.fields);
  const renamed = catalog.updateTable({ id: source.id, name: 'Техника в архиве' });
  assert.equal(renamed.description, edited.description);
  for (const description of [false, null, 'Архив\0склад']) {
    assert.throws(() => catalog.updateTable({ id: source.id, description }), CatalogError);
  }
  db.close();
  assert.deepEqual(catalog.listTables(), [renamed, copy]);
  const cleared = catalog.updateTable({ id: copy.id, description: '' });
  assert.equal(cleared.description, '');
  assert.deepEqual(catalog.listTables(), [renamed, cleared]);
  assert.deepEqual(catalog.searchRecords({ tableId: source.id }).rows, [record]);
});

test('копия использует актуальную структуру раздела и независимо хранит поля, записи и настройки вида', t => {
  const { db, catalog } = fixture(t);
  const origin = catalog.createTable({ name: 'Склад', fields: [
    { label: 'Удаляемое', type: 'number' }, { label: 'Название', type: 'text' },
    { label: 'Статус', type: 'select', options: ['Новый', 'Выдан'], required: true, hint: 'Выберите статус' },
  ] });
  const collection = catalog.saveCollection({ name: 'Запасы', tableIds: [origin.id] });
  const source = catalog.updateTable({ id: origin.id, fields: [
    origin.fields[2], origin.fields[1], { label: 'Месяц учёта', type: 'month' },
  ] });
  const record = catalog.saveRecord({ tableId: source.id, values: { f_3: 'Новый', f_2: 'Мышь' } });
  catalog.setTableSort({ tableId: source.id, sort: { key: 'f_3', direction: 'desc' } });
  catalog.setColumnWidth({ tableId: source.id, fieldKey: 'f_2', width: 200 });

  const copy = catalog.copyTableStructure({ sourceId: source.id, name: 'Склад филиала' });
  assert.equal(copy.collectionId, collection.id);
  assert.deepEqual(copy.fields, [
    { ...source.fields[0], key: 'f_1' }, { ...source.fields[1], key: 'f_2' }, { ...source.fields[2], key: 'f_3' },
  ]);
  db.close();
  assert.deepEqual(catalog.listTables(), [source, copy]);
  assert.deepEqual(catalog.searchRecords({ tableId: copy.id }), { total: 0, rows: [] });
  assert.equal(catalog.listTableSorts()[copy.id], undefined);
  assert.equal(catalog.listColumnWidths()[copy.id], undefined);
  assert.throws(() => catalog.saveRecord({ tableId: copy.id, values: {} }), CatalogError);
  const newRecord = catalog.saveRecord({ tableId: copy.id, values: { f_1: 'Выдан' } });
  catalog.updateTable({ id: copy.id, fields: [
    { ...copy.fields[0], options: ['Новый', 'Списан'], optionSources: ['Новый', 'Выдан'] }, ...copy.fields.slice(1),
  ] });
  assert.deepEqual(catalog.searchRecords({ tableId: source.id }).rows, [record]);
  assert.deepEqual(catalog.listTables()[0], source);
  assert.deepEqual(catalog.searchRecords({ tableId: copy.id }).rows, [
    { ...newRecord, values: { ...newRecord.values, f_1: 'Списан' } },
  ]);
});

test('копирование проверяет имя, исходный раздел и выбранную коллекцию до сохранения', t => {
  const { catalog } = fixture(t);
  const collection = catalog.saveCollection({ name: 'Офис', tableIds: [] });
  const source = catalog.createTable({ name: 'Акты', collectionId: collection.id, fields: [{ type: 'text', label: 'Код' }] });
  const request = { sourceId: source.id, name: 'Архив' };
  for (const invalid of [{ name: ' акты ' }, { name: '' }, { sourceId: 999 }, { collectionId: 999 }]) {
    assert.throws(() => catalog.copyTableStructure({ ...request, ...invalid }), CatalogError);
  }
  assert.deepEqual(catalog.listTables(), [source]);
  const ungrouped = catalog.copyTableStructure({ ...request, collectionId: null });
  assert.equal(ungrouped.collectionId, null);
  assert.equal(ungrouped.id, source.id + 1);
  const destination = catalog.saveCollection({ name: 'Склад', tableIds: [] });
  const moved = catalog.copyTableStructure({ ...request, name: 'Бланки', collectionId: destination.id });
  assert.equal(moved.collectionId, destination.id);
});

test('коллекции объединяют выбранные разделы, поддерживают общий поиск и сохраняют записи при расформировании', t => {
  const { db, catalog } = fixture(t);
  const fields = [{ label: 'Код', type: 'text' }];
  const first = catalog.createTable({ name: 'Приборы', fields });
  const empty = catalog.createTable({ name: 'Материалы', fields });
  const extra = catalog.createTable({ name: 'Акты', fields });
  const a = catalog.saveRecord({ tableId: first.id, values: { f_1: 'A245' } });
  const b = catalog.saveRecord({ tableId: extra.id, values: { f_1: 'Б245' } });
  const warehouse = catalog.saveCollection({ name: 'Склад', tableIds: [first.id, empty.id] });
  const office = catalog.saveCollection({ name: 'Офис', tableIds: [extra.id] });
  assert.throws(() => catalog.saveCollection({ name: ' склад ', tableIds: [] }), CatalogError);
  assert.throws(() => catalog.saveCollection({ id: office.id, name: 'Учёт', tableIds: [first.id, 999] }), CatalogError);
  assert.deepEqual(catalog.listCollections(), [warehouse, office]);
  assert.deepEqual(catalog.searchRecordGroups({ collectionId: warehouse.id, query: '245' }), [
    { tableId: first.id, total: 1, rows: [a], offset: 0 },
    { tableId: empty.id, total: 0, rows: [], offset: 0 },
  ]);
  assert.deepEqual(catalog.searchRecords({ query: '245' }).rows, [b, a]);
  const updated = catalog.saveCollection({ id: warehouse.id, name: 'Оборудование', tableIds: [first.id, extra.id] });
  db.close();
  assert.deepEqual(catalog.listCollections(), [updated, office]);
  assert.deepEqual(catalog.listTables().map(table => table.collectionId), [updated.id, null, updated.id]);
  assert.deepEqual(catalog.searchRecordGroups({ collectionId: office.id }), []);
  catalog.deleteCollection({ id: updated.id });
  assert.deepEqual(catalog.listTables().map(table => table.collectionId), [null, null, null]);
  assert.deepEqual(catalog.listCollections(), [office]);
  assert.deepEqual(catalog.searchRecords({ query: '245' }).rows, [b, a]);
});

test('удаление раздела очищает его таблицу и поиск без повторной выдачи удалённого идентификатора', t => {
  const { db, catalog } = fixture(t);
  const fields = [{ label: 'Код', type: 'text' }];
  const other = catalog.createTable({ name: 'Акты', fields });
  const removed = catalog.createTable({ name: 'Журналы', fields });
  const survivor = catalog.saveRecord({ tableId: other.id, values: { f_1: 'X245' } });
  catalog.saveRecord({ tableId: removed.id, values: { f_1: 'Y245' } });
  const collection = catalog.saveCollection({ name: 'Учёт', tableIds: [other.id, removed.id] });
  catalog.deleteTable({ id: removed.id });
  db.close();
  assert.deepEqual(catalog.searchRecords({ query: '245' }).rows, [survivor]);
  assert.deepEqual(catalog.searchRecordGroups({ collectionId: collection.id }).map(group => group.tableId), [other.id]);
  assert.equal(db.open().prepare('SELECT name FROM sqlite_schema WHERE name = ?').get('inventory_' + removed.id), undefined);
  const replacement = catalog.createTable({ name: removed.name, fields });
  assert.ok(replacement.id > removed.id);
  assert.throws(() => catalog.deleteTable({ id: removed.id }), CatalogError);
  assert.throws(() => catalog.updateTable({ id: removed.id, name: 'Архив' }), CatalogError);
  assert.deepEqual(catalog.listTables().at(-1), replacement);
});
