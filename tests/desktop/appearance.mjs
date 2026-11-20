import assert from 'node:assert/strict';
import { DEFAULT_APPEARANCE } from '../../src/shared/settings.js';
import { checkSettingsLayout } from './settingsLayout.mjs';

const customized = { fontFamily: 'harry-potter', fontSize: 16, primaryColor: '#000000', secondaryColor: '#e87ca1' };
const sizeInput = value => `input[name="fontSize"][value="${value}"]`;
const control = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';

// Serialize a small sample of actual UI styles across the two launches of the temporary profile.
function currentStyles() {
  const root = getComputedStyle(document.documentElement);
  const sidebar = getComputedStyle(document.querySelector('.sidebar'));
  return { fontFamily: root.fontFamily, fontSize: root.fontSize, background: root.backgroundColor, sidebar: sidebar.background };
}

async function sampleSelectedFont() {
  const family = getComputedStyle(document.documentElement).fontFamily.split(',')[0];
  const cyrillic = 'Журнал учёта';
  const spec = '16px ' + family;
  const faces = await document.fonts.load(spec, cyrillic);
  const context = document.createElement('canvas').getContext('2d');
  function width(fonts) {
    context.font = '16px ' + fonts;
    return context.measureText(cyrillic).width;
  }
  return {
    faces: faces.map(face => face.status), loaded: document.fonts.check(spec, cyrillic),
    withMonoFallback: width(family + ', monospace'), withSerifFallback: width(family + ', serif'),
    mono: width('monospace'), serif: width('serif'),
  };
}

export async function checkAppearance(window, evaluate, waitFor, phase) {
  window.setContentSize(1120, 740);
  const fonts = control('select[name="fontFamily"]');
  const root = 'document.documentElement';
  const reset = control('[data-action="reset-appearance"]');
  await waitFor(fonts + '?.matches(":enabled")');

  async function change(selector, value) {
    const target = control(selector);
    await waitFor(target + '?.matches(":enabled")');
    await evaluate(`(() => { const input = ${target}; input.value = ${JSON.stringify(value)};
      input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }

  async function checkAccent(primaryColor, foreground, background) {
    await change('input[name="primaryColor"]', primaryColor);
    await waitFor(root + '.style.getPropertyValue("--choice-primary").trim() === ' + JSON.stringify(primaryColor));
    await evaluate(control('.library-link') + '.click()');
    const button = control('main .primary');
    await waitFor('Boolean(' + button + ')');
    await waitFor(`getComputedStyle(${button}).backgroundColor === ${JSON.stringify(background)}`);
    assert.equal(await evaluate(`getComputedStyle(${button}).color`), foreground);
    await evaluate(control('a[href="#/settings"]') + '.click()');
    await waitFor(fonts + '?.matches(":enabled")');
  }

  async function verifyFont(family) {
    await waitFor('getComputedStyle(' + root + ').fontFamily.includes(' + JSON.stringify(family) + ')');
    const font = await evaluate('(' + sampleSelectedFont + ')()');
    assert.ok(font.faces.length > 0 && font.faces.every(status => status === 'loaded') && font.loaded, 'Загружен ' + family);
    assert.notEqual(font.mono, font.serif);
    assert.equal(font.withMonoFallback, font.withSerifFallback, 'Кириллица отображается шрифтом ' + family);
  }

  if (phase === 'appearance') {
    const choices = await evaluate('Array.from(' + fonts + '.options, option => option.value)');
    assert.deepEqual(choices.sort(), ['arial', 'cormorant', 'harry-potter', 'manrope', 'system']);
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(\'input[name="fontSize"]\'), input => input.value).sort()'),
      ['12', '13', '14', '15', '16']);
    assert.deepEqual(await evaluate('window.inventory.getAppearance()'), DEFAULT_APPEARANCE);
    await checkSettingsLayout(window, evaluate, waitFor, 14);
    await evaluate('localStorage.setItem("smoke-default-appearance", JSON.stringify((' + currentStyles + ')()))');
    await evaluate(control(sizeInput(16)) + '.click()');
    await checkSettingsLayout(window, evaluate, waitFor, 16);
    await evaluate(control(sizeInput(12)) + '.click()');
    await waitFor('getComputedStyle(' + root + ').fontSize === "12px"');
    const navigationSize = 'parseFloat(getComputedStyle(document.querySelector(".library-link")).fontSize)';
    const small = await evaluate(navigationSize);
    await change('select[name="fontFamily"]', 'cormorant');
    await verifyFont('Inventory Cormorant');
    await change('select[name="fontFamily"]', 'manrope');
    await verifyFont('Inventory Manrope');
    await change('select[name="fontFamily"]', 'harry-potter');
    await evaluate(control(sizeInput(16)) + '.click()');
    await waitFor('getComputedStyle(' + root + ').fontSize === "16px"');
    assert.ok(await evaluate(navigationSize) > small, 'Размер текста изменился в боковом меню');
    await change('input[name="secondaryColor"]', customized.secondaryColor);
    await waitFor('getComputedStyle(' + root + ').backgroundColor !== JSON.parse(localStorage.getItem("smoke-default-appearance")).background');
    await checkAccent('#ffffff', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)');
    await checkAccent('#000000', 'rgb(255, 255, 255)', 'rgb(0, 0, 0)');
  }

  await waitFor(fonts + '?.value === "harry-potter" && ' + control(sizeInput(16)) + '?.checked');
  await verifyFont('Inventory Wizard');
  assert.deepEqual(await evaluate('window.inventory.getAppearance()'), customized);
  if (phase === 'appearance') await checkSettingsLayout(window, evaluate, waitFor, 16);
  if (phase === 'appearanceRestart') {
    await evaluate(reset + '.click()');
    await waitFor(fonts + '.value === "system" && ' + control(sizeInput(14)) + '.checked');
    await waitFor('!document.documentElement.hasAttribute("data-custom-primary") && !document.documentElement.hasAttribute("data-custom-secondary")');
    assert.deepEqual(await evaluate('(' + currentStyles + ')()'), await evaluate('JSON.parse(localStorage.getItem("smoke-default-appearance"))'));
    assert.deepEqual(await evaluate('window.inventory.getAppearance()'), DEFAULT_APPEARANCE);
  }
  assert.equal(await evaluate('window.inventory.getTheme()'), 'dark');
}
