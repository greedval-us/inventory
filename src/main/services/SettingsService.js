import { DEFAULT_APPEARANCE, validateAppearance, validateTheme } from '../../shared/settings.js';

export class SettingsService {
  constructor(repository) {
    this.repository = repository;
  }

  getTheme() {
    return validateTheme(this.repository.get('theme'));
  }

  setTheme(value) {
    const theme = validateTheme(value);
    this.repository.set('theme', theme);
    return theme;
  }

  getAppearance() {
    const stored = this.repository.get('appearance');
    return stored === undefined ? DEFAULT_APPEARANCE : validateAppearance(JSON.parse(stored));
  }

  setAppearance(value) {
    const appearance = validateAppearance(value);
    this.repository.set('appearance', JSON.stringify(appearance));
    return appearance;
  }
}
