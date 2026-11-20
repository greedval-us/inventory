import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { x as extractTar } from 'tar';

const root = fileURLToPath(new URL('../../', import.meta.url));
const version = '9.6.0';
const cache = join(root, '.cache', 'legacy-sqlite-' + version);
const output = join(root, 'build', 'legacy');
const nativeName = 'better_sqlite3.node';
const nativeHash = '90206ec88300328c7d71e620e1314d3d47ccfd6f2ab83963d850154102f33200';

const archives = [
  {
    filename: 'package.tgz',
    url: `https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-${version}.tgz`,
    algorithm: 'sha512', encoding: 'base64',
    digest: 'yR5HATnqeYNVnkaUTf4bOP2dJSnyhP4puJN/QPRyx4YkBEEUxib422n2XzPqDEHjQQqazoYoADdAm5vE15+dAQ==',
    strip: 1,
    include: path => path === 'package/LICENSE' || path === 'package/package.json' || /^package\/lib\/(?:methods\/)?[\w-]+\.js$/.test(path),
  },
  {
    filename: 'native.tgz',
    url: `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/better-sqlite3-v${version}-electron-v110-win32-ia32.tar.gz`,
    algorithm: 'sha256', encoding: 'hex',
    digest: '92488d59ed34c702c4359b08025c0960eb12c64dff4cd0f221677ae7414d0791',
    strip: 2,
    include: path => path === 'build/Release/' + nativeName,
  },
];

function digest(data, algorithm, encoding) {
  return createHash(algorithm).update(data).digest(encoding);
}

async function verifiedArchive(archive) {
  const { filename, algorithm, encoding, url } = archive;
  const file = join(cache, filename);
  try {
    if (digest(await readFile(file), algorithm, encoding) === archive.digest) return file;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download failed for ${url} (HTTP ${response.status})`);
  const data = Buffer.from(await response.arrayBuffer());
  if (digest(data, algorithm, encoding) !== archive.digest) throw new Error('Checksum mismatch for ' + url);
  const temporary = file + '.' + randomUUID();
  try {
    await writeFile(temporary, data, { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return file;
}

await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(output, '.sqlite-'));
try {
  for (const archive of archives) {
    await extractTar({
      file: await verifiedArchive(archive), cwd: staging, strip: archive.strip,
      strict: true, filter: (path, entry) => entry.type === 'File' && archive.include(path),
    });
  }
  const binary = await readFile(join(staging, nativeName));
  if (digest(binary, 'sha256', 'hex') !== nativeHash) throw new Error('Unexpected SQLite native module');
  const destination = join(output, 'sqlite');
  await rm(destination, { recursive: true, force: true });
  await rename(staging, destination);
  console.log(`Prepared better-sqlite3 ${version} for Electron ABI 110, Windows x86`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
