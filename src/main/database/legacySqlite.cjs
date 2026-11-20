const { join } = require('node:path');
const { fileURLToPath } = require('node:url');

// This module replaces node:sqlite only in the Electron 22 bundle.
const directory = join(process.resourcesPath, 'sqlite');
const Database = require(join(directory, 'lib'));

class DatabaseSync extends Database {
  constructor(filename, { readOnly = false } = {}) {
    const options = { nativeBinding: join(directory, 'better_sqlite3.node'), readonly: readOnly };
    if (filename.startsWith('file:')) {
      let url = new URL(filename);
      if (url.search !== '?mode=rw' || url.hash) throw new TypeError('Unsupported SQLite file URL');
      if (!url.host && url.pathname.startsWith('//')) url = new URL('file:' + url.pathname);
      filename = fileURLToPath(url);
      options.fileMustExist = true;
    }
    super(filename, options);
  }
}

module.exports = { DatabaseSync };
