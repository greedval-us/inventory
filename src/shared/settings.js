export const DEFAULT_THEME = 'system';
export const THEME_LABELS = Object.freeze({ system: 'Системная', light: 'Светлая', dark: 'Тёмная' });
export const FONT_LABELS = Object.freeze({
  system: 'Системный', arial: 'Arial', cormorant: 'Cormorant Garamond', manrope: 'Manrope', 'harry-potter': 'Гарри Поттер',
});
export const FONT_SIZES = Object.freeze([12, 13, 14, 15, 16]);
export const DEFAULT_APPEARANCE = Object.freeze({
  fontSize: 14,
  fontFamily: 'system',
  primaryColor: null,
  secondaryColor: null,
});

export function validateTheme(value) {
  if (typeof value !== 'string' || !Object.hasOwn(THEME_LABELS, value)) {
    throw new TypeError('Выберите системную, светлую или тёмную тему.');
  }
  return value;
}

function validatedColor(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new TypeError('Выберите цвет в формате #RRGGBB.');
  }
  return value.toLowerCase();
}

export function validateAppearance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_APPEARANCE, key))) {
    throw new TypeError('Неверный формат настроек оформления.');
  }
  const { fontSize, fontFamily, primaryColor, secondaryColor } = value;
  if (!FONT_SIZES.includes(fontSize)) {
    throw new TypeError(`Размер текста должен быть целым числом от ${FONT_SIZES[0]} до ${FONT_SIZES.at(-1)}.`);
  }
  if (typeof fontFamily !== 'string' || !Object.hasOwn(FONT_LABELS, fontFamily)) throw new TypeError('Выберите шрифт из списка.');
  return { fontSize, fontFamily, primaryColor: validatedColor(primaryColor), secondaryColor: validatedColor(secondaryColor) };
}
