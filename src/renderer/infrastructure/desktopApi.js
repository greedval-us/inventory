export function getDesktopApi() {
  if (!window.inventory) {
    throw new Error('Связь с приложением недоступна.');
  }
  return window.inventory;
}
