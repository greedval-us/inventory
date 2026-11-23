import { spawn } from 'node:child_process';
import { once } from 'node:events';
import electron from 'electron';
import { DEV_SERVER_URL } from '../src/shared/runtime.js';

const args = process.argv.slice(2);
const development = args[0] === '--dev';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let stopServer;
try {
  if (development) {
    args.shift();
    const { startDevServer } = await import('./devServer.mjs');
    stopServer = await startDevServer();
    env.INVENTORY_DEV_SERVER_URL = DEV_SERVER_URL;
  }
  const child = spawn(electron, ['.', ...args], { stdio: 'inherit', env });
  // Vite can exit the launcher when its standard input closes.
  const stopChild = () => child.kill();
  process.once('exit', stopChild);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal));
  }
  const [code] = await once(child, 'exit');
  process.off('exit', stopChild);
  process.exitCode = code ?? 1;
} finally {
  await stopServer?.();
}
