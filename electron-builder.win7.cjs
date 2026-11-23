const base = require('./electron-builder.config.cjs');
const { rendererFiles, excludeDependencyMetadata } = require('./scripts/packagingFiles.cjs');

module.exports = {
  ...base,
  electronVersion: '22.3.27',
  npmRebuild: false,
  directories: { ...base.directories, output: 'release/legacy' },
  extraMetadata: { main: 'build/main/index.cjs', type: 'commonjs' },
  files: [
    { from: 'build/legacy/main', to: 'build/main', filter: ['index.cjs', 'preload.cjs'] },
    rendererFiles('build/legacy/renderer'),
    'src/main/attachments/photoDecoder.ps1',
    'package.json',
    excludeDependencyMetadata,
  ],
  extraResources: [{ from: 'build/legacy/sqlite', to: 'sqlite' }],
  win: {
    ...base.win,
    target: [
      { target: 'nsis', arch: ['ia32'] },
      { target: 'portable', arch: ['ia32'] },
    ],
  },
  nsis: { ...base.nsis, artifactName: 'Inventory-Setup-Win7-8-x86-${version}.${ext}' },
  portable: { artifactName: 'Inventory-Win7-8-x86-${version}.${ext}' },
};
