import { build, createServer } from 'vite';

export async function startDevServer() {
  const server = await createServer();
  let watcher;
  const close = () => Promise.all([watcher?.close(), server.close()]);
  try {
    watcher = await build({
      configFile: 'vite.preload.config.js',
      build: { watch: {} },
    });
    const firstBuild = new Promise((resolve, reject) => {
      function onBuild(event) {
        if (event.code !== 'BUNDLE_END' && event.code !== 'ERROR') return;
        watcher.off('event', onBuild);
        if (event.code === 'ERROR') reject(event.error);
        else resolve();
      }
      watcher.on('event', onBuild);
    });
    await Promise.all([server.listen(), firstBuild]);
    server.printUrls();
    return close;
  } catch (error) {
    await close();
    throw error;
  }
}
