module.exports = {
  appId: 'com.greedval.inventory',
  productName: 'Inventory',
  asar: true,
  directories: { output: 'release', buildResources: 'packaging' },
  files: ['build/main/**', 'build/renderer/**', 'src/main/**', 'src/shared/**', 'package.json'],
  afterPack: async context => {
    if (context.electronPlatformName === 'win32') {
      const { setWindowsVersion } = await import('./scripts/setWindowsVersion.mjs');
      setWindowsVersion(context);
    }
  },
  win: { target: ['nsis', 'portable'], signAndEditExecutable: false },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
};
