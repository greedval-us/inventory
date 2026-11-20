import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { decodeWindowsPhoto } from './windowsPhoto.js';

// Match the XML document element, rather than an SVG tag somewhere inside an HTML document.
function hasSvgRoot(bytes) {
  const first = bytes.toString('hex', 0, 2);
  const encoding = first === 'fffe' || first === '3c00' ? 'utf-16le'
    : first === 'feff' || first === '003c' ? 'utf-16be' : 'utf-8';
  let xml = new TextDecoder(encoding).decode(bytes).trimStart();
  while (xml.startsWith('<?') || xml.startsWith('<!--') || /^<!DOCTYPE\s+svg[\s>]/.test(xml)) {
    const end = xml.startsWith('<!--') ? '-->' : xml.startsWith('<?') ? '?>' : '>';
    const index = xml.indexOf(end);
    if (index < 0) return false;
    xml = xml.slice(index + end.length).trimStart();
  }
  return /^<svg(?=[\s/>])/.test(xml);
}

function containerFormat(bytes) {
  if (bytes.length < 16 || bytes.toString('latin1', 4, 8) !== 'ftyp') return;
  const boxSize = Math.min(bytes.readUInt32BE(0) || bytes.length, bytes.length);
  const brands = [bytes.toString('latin1', 8, 12)];
  for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(bytes.toString('latin1', i, i + 4));
  if (brands.some(brand => brand === 'avif' || brand === 'avis')) return 'image/avif';
  if (brands.some(brand => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'crx '].includes(brand))) {
    return 'windows';
  }
}

function imageFormat(bytes) {
  const magic = bytes.toString('hex', 0, 8);
  if (magic === '89504e470d0a1a0a') return 'image/png';
  if (magic.startsWith('ffd8ff')) return 'image/jpeg';
  if (/^GIF8[79]a/.test(bytes.toString('latin1', 0, 6))) return 'image/gif';
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (magic.startsWith('424d')) return 'image/bmp';
  if (magic.startsWith('00000100')) return 'image/x-icon';
  if (/^(4949(?:2a00|2b00)|4d4d(?:002a|002b))/.test(magic)) return 'windows';
  return containerFormat(bytes) ?? (hasSvgRoot(bytes) ? 'image/svg+xml' : null);
}

export async function openPhotoStream({ path, size }, isCurrent) {
  const handle = await open(path, 'r');
  let streaming = false;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size !== size) return null;
    const header = Buffer.alloc(Math.min(size, 8192));
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const format = imageFormat(header.subarray(0, bytesRead));
    if (!format || !isCurrent()) return null;
    if (format === 'windows') {
      const png = await decodeWindowsPhoto(path);
      return { mime: 'image/png', length: png.length, data: Readable.from([png]) };
    }
    // Chromium decodes the original bytes, preserving EXIF orientation, profiles and animation.
    const data = handle.createReadStream({ start: 0, autoClose: true });
    streaming = true;
    return { mime: format, length: size, data };
  } finally {
    if (!streaming) await handle.close();
  }
}
