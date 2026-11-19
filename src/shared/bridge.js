import { CHANNELS } from './channels.js';
import { validateTheme } from './settings.js';

export function createBridge(invoke) {
  return Object.freeze({
    getInfo: () => invoke(CHANNELS.GET_INFO),
    getTheme: () => invoke(CHANNELS.GET_THEME),
    setTheme: async theme => invoke(CHANNELS.SET_THEME, validateTheme(theme)),
  });
}
