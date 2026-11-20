// Runs in the real renderer. Only interact with controls exposed to the user.
async function exerciseRegistry(phase) {
  function until(description, read) {
    const current = read();
    if (current) return Promise.resolve(current);
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        const result = read();
        if (result) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(result);
        }
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(description + '\n' + document.body.innerText.slice(-1500)));
      }, 6000);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    });
  }

  const find = (selector, index = 0) => until(selector, () => document.querySelectorAll(selector)[index]);
  async function click(selector) {
    const element = await until('Доступно действие ' + selector, () => {
      const target = document.querySelector(selector);
      return target && !target.matches(':disabled') && target;
    });
    element.click();
  }
  async function fill(control, value) {
    control.value = value;
    control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }
  async function chooseByText(control, text) {
    const option = Array.from(control.options).find(item => item.textContent.trim() === text);
    if (!option) throw new Error('Нет варианта «' + text + '» в ' + control.name);
    await fill(control, option.value);
  }
  const action = name => '[data-action="' + name + '"]';
  const diskSection = 'Жёсткие диски';
  const documentSection = 'Документы';
  async function allRecords() {
    await click('a[href="#/"]');
    await find('a[href="#/"][aria-current=page]');
  }

  async function createSection(name, fields) {
    await click('a[href="#/sections/new"]');
    await fill(await find('input[name=tableName]'), name);
    for (const [i, [label, type, options]] of fields.entries()) {
      if (i) await click(action('add-field'));
      await fill(await find('input[name=fieldLabel]', i), label);
      await fill(await find('select[name=fieldType]', i), type);
      if (options) await fill(await find('textarea[name=fieldOptions]'), options.join('\n'));
    }
    await click('form button[type=submit]');
    await until('Сохранение раздела ' + name, () => /^#\/sections\/\d+$/.test(location.hash) &&
      document.querySelector('main h1')?.textContent.trim() === name);
  }

  async function startRecord(section) {
    await allRecords();
    await click(action('new-record'));
    await chooseByText(await find('dialog select[name=tableId]'), section);
  }
  async function field(label) {
    return until('Поле «' + label + '»', () => {
      const wrapper = Array.from(document.querySelectorAll('dialog label')).find(element =>
        Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() === label));
      return wrapper?.querySelector('input, select, textarea');
    });
  }
  async function saveRecord() {
    await click(action('save-record'));
    await until('Закрытие формы после сохранения', () => !document.querySelector('dialog[open]'));
  }
  const rows = () => Array.from(document.querySelectorAll('table tbody tr')).filter(row => row.querySelector(action('edit-record')));
  const rowWith = text => rows().find(row => row.textContent.includes(text));
  const expectRows = (...labels) => until('Строки реестра: ' + labels.join(', '), () =>
    rows().length === labels.length && labels.every(label => rowWith(label)));
  const groupName = group => group.querySelector('h2')?.textContent.trim();
  function expectGroups(...names) {
    return until('Таблицы разделов: ' + names.join(', '), () => {
      const groups = Array.from(document.querySelectorAll('section[data-section-id]'));
      return groups.length === names.length && groups.every((group, i) =>
        groupName(group) === names[i] && group.querySelector('table')) && groups;
    });
  }
  function expectHeaders(group, fields) {
    const headers = Array.from(group.querySelectorAll('thead th'), th => th.textContent.trim());
    if (headers.join('|') !== [...fields, 'Действия'].join('|')) {
      throw new Error('Поля раздела «' + groupName(group) + '»: ' + headers.join(', '));
    }
  }
  async function toggleSection(name) {
    const control = await until('Фильтр раздела «' + name + '»', () =>
      Array.from(document.querySelectorAll('input[name=visibleSection]'))
        .find(input => input.closest('label')?.textContent.trim() === name));
    control.click();
  }

  await allRecords();
  await until('Общий экран «Все разделы»', () =>
    document.querySelector('h1')?.textContent.trim() === 'Все разделы' &&
    document.querySelector('nav a[aria-current=page]')?.textContent.trim() === 'Все разделы');
  if (phase === 'restart') {
    const [disks, documents] = await expectGroups(diskSection, documentSection);
    await expectRows('Архивный накопитель');
    const row = rowWith('Архивный накопитель');
    if (!disks.contains(row) || documents.querySelector(action('edit-record'))) {
      throw new Error('Восстановленная запись должна находиться только в разделе дисков.');
    }
    for (const value of ['2048', 'SATA', 'Да']) {
      if (!row.textContent.includes(value)) throw new Error('В восстановленной записи отсутствует ' + value);
    }
    return;
  }
  await createSection(diskSection, [
    ['Модель', 'text'], ['Ёмкость', 'number'], ['Интерфейс', 'select', ['SATA', 'USB']], ['На складе', 'checkbox'],
  ]);
  await createSection(documentSection, [['Название', 'text'], ['Комментарий', 'text']]);
  await allRecords();
  const [emptyDisks, emptyDocuments] = await expectGroups(diskSection, documentSection);
  expectHeaders(emptyDisks, ['Модель', 'Ёмкость', 'Интерфейс', 'На складе']);
  expectHeaders(emptyDocuments, ['Название', 'Комментарий']);
  await expectRows();
  await startRecord(diskSection);
  await fill(await field('Модель'), 'Накопитель Север');
  await fill(await field('Ёмкость'), '12450');
  await chooseByText(await field('Интерфейс'), 'SATA');
  (await field('На складе')).click();
  await saveRecord();
  await expectRows('Накопитель Север');
  await startRecord(documentSection);
  await fill(await field('Название'), 'Инструкция 142');
  await fill(await field('Комментарий'), 'СЕВЕР / doc-245-x');
  await saveRecord();
  await expectRows('Инструкция 142', 'Накопитель Север');
  await startRecord(documentSection);
  await fill(await field('Название'), 'Акт 39');
  await saveRecord();
  await expectRows('Акт 39', 'Инструкция 142', 'Накопитель Север');
  const search = await find('input[name=query]');
  await fill(search, '245');
  await expectRows('Инструкция 142', 'Накопитель Север');
  const [disks, documents] = await expectGroups(diskSection, documentSection);
  if (!disks.contains(rowWith('Накопитель Север')) || !documents.contains(rowWith('Инструкция 142'))) {
    throw new Error('Найденные строки должны остаться в таблицах своих разделов.');
  }
  const filter = await find('details[data-action="section-filter"]');
  if (!filter.open) await click('details[data-action="section-filter"] summary');
  await toggleSection(documentSection);
  await expectGroups(diskSection);
  await expectRows('Накопитель Север');
  await until('Одно совпадение в скрытом разделе', () => document.querySelector('.hidden-matches')?.textContent.includes('— 1.'));
  await toggleSection(diskSection);
  await expectGroups();
  await expectRows();
  await until('Оба совпадения в скрытых разделах', () => document.querySelector('.hidden-matches')?.textContent.includes('— 2.'));
  await toggleSection(documentSection);
  await expectGroups(documentSection);
  await expectRows('Инструкция 142');
  await click(action('show-all-sections'));
  await expectGroups(diskSection, documentSection);
  await expectRows('Инструкция 142', 'Накопитель Север');
  if ((await find('input[name=query]')).value !== '245') throw new Error('Фильтр разделов должен сохранять текст поиска.');
  await fill(search, 'нет-такой-записи');
  await until('Пустой результат поиска', () => document.querySelector('main')?.textContent.includes('Совпадений нет'));
  await expectGroups();
  await fill(search, 'север');
  await expectRows('Инструкция 142', 'Накопитель Север');
  await chooseByText(await find('select[name=field]'), 'Модель');
  await expectRows('Накопитель Север');
  await allRecords();
  await expectRows('Акт 39', 'Инструкция 142', 'Накопитель Север');
  await fill(await find('input[name=query]'), 'докум');
  await expectRows('Акт 39', 'Инструкция 142');
  const sectionLink = await until('Ссылка на раздел', () =>
    Array.from(document.querySelectorAll('nav a')).find(a => a.textContent.trim() === documentSection));
  sectionLink.click();
  await until('Открыт раздел документов', () => document.querySelector('h1')?.textContent.trim() === documentSection &&
    document.querySelector('input[name=query]')?.value === '');
  await expectRows('Акт 39', 'Инструкция 142');
  await chooseByText(await find('select[name=field]'), 'Комментарий');
  await fill(await find('input[name=query]'), 'север');
  await expectRows('Инструкция 142');
  await click(action('search-all-sections'));
  await expectRows('Инструкция 142', 'Накопитель Север');
  const globalSearch = await find('input[name=query]');
  if (globalSearch.value !== 'север' || (await find('select[name=field]')).value !== '') {
    throw new Error('Общий поиск должен сохранить запрос и искать по всем полям.');
  }
  await fill(globalSearch, '');
  await expectRows('Акт 39', 'Инструкция 142', 'Накопитель Север');
  rowWith('Акт 39').querySelector(action('delete-record')).click();
  await click(action('confirm-delete'));
  await expectRows('Инструкция 142', 'Накопитель Север');
  rowWith('Накопитель Север').querySelector(action('edit-record')).click();
  await fill(await field('Модель'), 'Архивный накопитель');
  await fill(await field('Ёмкость'), '2048');
  await saveRecord();
  await expectRows('Инструкция 142', 'Архивный накопитель');
  rowWith('Инструкция 142').querySelector(action('delete-record')).click();
  await click(action('confirm-delete'));
  await expectRows('Архивный накопитель');
}

export function checkRegistry(window, phase) {
  return window.webContents.executeJavaScript('(' + exerciseRegistry.toString() + ')(' + JSON.stringify(phase) + ')');
}
