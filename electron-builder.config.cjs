const { rendererFiles, excludeDependencyMetadata } = require('./scripts/packagingFiles.cjs');

module.exports = {
  appId: 'com.greedval.inventory',
  productName: 'Inventory',
  asar: true,
  directories: { output: 'release', buildResources: 'packaging' },
  files: [
    'build/main/preload.cjs',
    'src/{main,shared}/**/*.js',
    '!src/**/.*{,/**/*}',
    '!src/**/{test,tests,__tests__}/**/*',
    '!src/**/*.{test,spec}.js',
    'src/main/attachments/photoDecoder.ps1',
    'package.json',
    excludeDependencyMetadata,
    rendererFiles('build/renderer'),
  ],
  afterPack: async context => {
    if (context.electronPlatformName === 'win32') {
      const { setWindowsVersion } = await import('./scripts/setWindowsVersion.mjs');
      setWindowsVersion(context);
    }
  },
  win: { target: ['nsis', 'portable'], signAndEditExecutable: false },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
};
