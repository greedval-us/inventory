export const DEFAULT_THEME = 'system';
export const THEMES = Object.freeze([DEFAULT_THEME, 'light', 'dark']);

export function validateTheme(value) {
  if (!THEMES.includes(value)) {
    throw new TypeError('Выберите системную, светлую или тёмную тему.');
  }
  return value;
}
