import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEV_SERVER_URL } from '../../shared/runtime.js';

export function getRendererUrl(appPath, devUrl) {
  if (!devUrl) return pathToFileURL(join(appPath, 'build', 'renderer', 'index.html')).href;
  if (devUrl !== DEV_SERVER_URL && devUrl !== DEV_SERVER_URL + '/') {
    throw new Error('Недопустимый адрес сервера разработки Inventory.');
  }
  return DEV_SERVER_URL + '/';
}

export function isRendererPage(url, rendererUrl) {
  return typeof url === 'string' && url.split('#', 1)[0] === rendererUrl;
}
