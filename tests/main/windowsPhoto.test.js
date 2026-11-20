import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { decodeWindowsPhoto } from '../../src/main/attachments/windowsPhoto.js';
import { CatalogError } from '../../src/shared/catalogError.js';

test('превью TIFF учитывает поворот и ограничивает размер, не изменяя оригинал', { skip: process.platform !== 'win32' }, async t => {
  const folder = await mkdtemp(join(tmpdir(), 'inventory-wic-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, "Снимок [1] & O'Brien.blob");
  const width = 2400, height = 10;
  // TIFF with a single grayscale strip and orientation 6 (90 degrees clockwise).
  const tags = [[256, 4, width], [257, 4, height], [258, 3, 8], [259, 3, 1], [262, 3, 1],
    [273, 4, 0], [274, 3, 6], [277, 3, 1], [278, 4, height], [279, 4, width * height]];
  const start = 8 + 2 + tags.length * 12 + 4;
  const data = Buffer.alloc(start + width * height);
  data.write('II');
  data.writeUInt16LE(42, 2);
  data.writeUInt32LE(8, 4);
  data.writeUInt16LE(tags.length, 8);
  tags.forEach(([tag, type, value], index) => {
    const offset = 10 + index * 12;
    data.writeUInt16LE(tag, offset);
    data.writeUInt16LE(type, offset + 2);
    data.writeUInt32LE(1, offset + 4);
    data.writeUInt32LE(tag === 273 ? start : value, offset + 8);
  });
  await writeFile(path, data);
  const png = await decodeWindowsPhoto(path);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [8, 1920]);
  assert.deepEqual(await readFile(path), data);
  await writeFile(path, 'invalid image');
  await assert.rejects(decodeWindowsPhoto(path), CatalogError);
});
