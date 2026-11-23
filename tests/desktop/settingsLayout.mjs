import assert from 'node:assert/strict';

// Runs in Chromium. Use the actual controls and their hit targets, regardless of the card order.
function measureSettings() {
  const groups = [
    ['input[name=theme]'],
    ['select[name=fontFamily]', 'input[name=fontSize]'],
    ['[data-palette]', 'input[name=primaryColor]', 'input[name=secondaryColor]'],
    ['[name=databasePath]', '[data-action=relocate-database]', '[data-action=open-database]'],
  ];
  const issues = [];
  const containers = new Set([document.documentElement, document.body]);
  const toggle = document.querySelector('[aria-controls="sidebar-nav"]');
  const menu = document.getElementById(toggle.getAttribute('aria-controls'));
  if (toggle.getClientRects().length && toggle.getAttribute('aria-expanded') === 'false' && menu.getClientRects().length) {
    issues.push('Закрытое компактное меню занимает место над настройками');
  }
  function hitPath(element) {
    const path = [];
    for (; element && element !== document.body; element = element.parentElement) {
      const action = element.getAttribute('data-action');
      path.push(element.localName + (element.id ? '#' + element.id : '')
        + Array.from(element.classList, name => '.' + name).join('') + (action ? '[data-action=' + action + ']' : ''));
    }
    return path.join(' < ');
  }
  function measure(selector) {
    const controls = document.querySelectorAll('main ' + selector);
    if (!controls.length) issues.push('Нет элемента ' + selector);
    return Array.from(controls, control => {
      // The visible label is the clickable area for the custom radio controls.
      const target = control.type === 'radio' ? control.labels[0] : control;
      for (let parent = target.parentElement; parent; parent = parent.parentElement) containers.add(parent);
      const rect = target.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!target.contains(hit) || !rect.width || !rect.height || rect.left < -1 || rect.right > innerWidth + 1
          || rect.top < -1 || rect.bottom > innerHeight + 1) {
        issues.push({
          control: control.type === 'radio' ? selector + '=' + control.value : selector,
          rect: [rect.left, rect.top, rect.width, rect.height].map(Math.round),
          hit: hit ? hitPath(hit) : null,
        });
      }
      return rect;
    });
  }
  const boxes = groups.map(selectors => {
    const rects = selectors.flatMap(measure);
    return {
      left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)),
      top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)),
    };
  });
  measure('[data-action=reset-appearance]');
  for (const el of containers) {
    if (!el.clientWidth) continue;
    const style = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 1 && (el === document.documentElement || style.overflowX !== 'visible')) {
      issues.push('Горизонтальное переполнение ' + el.tagName + '.' + el.className);
    }
    if (/^(auto|scroll)$/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      issues.push('Вертикальная прокрутка ' + el.tagName + '.' + el.className + ' на ' + (el.scrollHeight - el.clientHeight) + 'px');
    }
  }
  const sideBySide = boxes.some(a => boxes.some(b => a.right <= b.left + 1
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
  if (!sideBySide) issues.push('Все группы настроек выстроены в один столбец');
  return issues;
}

function currentMenuLinkIsReachable() {
  const link = document.querySelector('#sidebar-nav a[aria-current="page"]');
  if (!link) return false;
  const rect = link.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0
    && link.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
}

export async function checkSettingsLayout(window, evaluate, waitFor, fontSize) {
  const measure = '(' + measureSettings + ')()';
  // Let Chromium produce frames on the Windows runner without taking focus.
  if (!window.isVisible()) {
    window.setOpacity(0);
    window.setSkipTaskbar(true);
    window.showInactive();
  }
  async function resize(width, height) {
    window.setContentSize(width, height);
    await waitFor('Math.abs(innerWidth - ' + width + ') <= 1 && Math.abs(innerHeight - ' + height + ') <= 1');
    await evaluate(`(async () => {
      // The new innerWidth can arrive before Chromium commits the matching responsive layout.
      await new Promise(requestAnimationFrame);
      document.body.getBoundingClientRect();
      await document.fonts.ready;
      await new Promise(requestAnimationFrame);
    })()`);
  }
  await waitFor('document.querySelector("main input[name=databasePath]")?.value');
  await waitFor('getComputedStyle(document.documentElement).fontSize === "' + fontSize + 'px"');
  for (const [width, height] of [[1120, 740], [1024, 620], [640, 480]]) {
    await resize(width, height);
    assert.deepEqual(await evaluate(measure), [], 'Настройки ' + width + '×' + height + ', шрифт ' + fontSize + 'px');
    if (width === 640 && fontSize === 14) {
      const toggle = 'document.querySelector("[aria-controls=sidebar-nav]")';
      await evaluate(toggle + '.click()');
      await waitFor('(' + currentMenuLinkIsReachable + ')()');
      // Measure in the first microtask after Vue renders the closed menu.
      const afterClose = await evaluate(`(async () => {
        ${toggle}.click();
        await Promise.resolve();
        return ${measure};
      })()`);
      assert.deepEqual(afterClose, [], 'Настройки сразу после закрытия компактного меню');
    }
  }
  await resize(1120, 740);
  await evaluate('document.querySelector("main h1").scrollIntoView({block:"start", behavior:"instant"})');
}
