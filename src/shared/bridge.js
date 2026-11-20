import { CATALOG_CHANNELS, CHANNELS } from './channels.js';
import { validateAppearance, validateTheme } from './settings.js';

export function createBridge(invoke) {
  return Object.freeze({
    getInfo: () => invoke(CHANNELS.GET_INFO),
    getTheme: () => invoke(CHANNELS.GET_THEME),
    setTheme: async theme => invoke(CHANNELS.SET_THEME, validateTheme(theme)),
    getAppearance: () => invoke(CHANNELS.GET_APPEARANCE),
    setAppearance: async appearance => invoke(CHANNELS.SET_APPEARANCE, validateAppearance(appearance)),
    ...Object.fromEntries(Object.entries(CATALOG_CHANNELS).map(([name, channel]) =>
      [name, (...args) => invoke(channel, ...args)])),
  });
}
