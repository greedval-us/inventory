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
          hit: hit ? hit.localName + Array.from(hit.classList, item => '.' + item).join('') : null,
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

export async function checkSettingsLayout(window, evaluate, waitFor, fontSize) {
  await waitFor('document.querySelector("main input[name=databasePath]")?.value');
  await waitFor('getComputedStyle(document.documentElement).fontSize === "' + fontSize + 'px"');
  for (const [width, height] of [[1120, 740], [1024, 620], [640, 480]]) {
    window.setContentSize(width, height);
    await waitFor('Math.abs(innerWidth - ' + width + ') <= 1 && Math.abs(innerHeight - ' + height + ') <= 1');
    // Flush the responsive styles so Chromium starts any sidebar transition and requests its fonts.
    await evaluate('document.body.getBoundingClientRect(); document.fonts.ready.then(() => true)');
    await waitFor(`!document.getAnimations().some(animation =>
      (animation.pending || animation.playState === 'running') && Number.isFinite(animation.effect?.getComputedTiming().endTime))`);
    const issues = await evaluate('(' + measureSettings + ')()');
    assert.deepEqual(issues, [], 'Настройки ' + width + '×' + height + ', шрифт ' + fontSize + 'px');
  }
  window.setContentSize(1120, 740);
  await waitFor('Math.abs(innerWidth - 1120) <= 1 && Math.abs(innerHeight - 740) <= 1');
  await evaluate('document.querySelector("main h1").scrollIntoView({block:"start", behavior:"instant"})');
}
