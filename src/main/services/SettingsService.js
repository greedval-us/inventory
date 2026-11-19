import { validateTheme } from '../../shared/settings.js';

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
}
