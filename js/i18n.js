// UZ News - Language (UZ / RU) and theme (light / dark) helpers
(function () {
  const LANG_KEY = 'uznews_lang';
  const THEME_KEY = 'uznews_theme';

  const plural = (n, forms) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  };

  const STR = {
    uz: {
      tagline: "UZ News — O'zbekistonning eng tezkor yangiliklari",
      'nav.all': 'Bosh sahifa', 'nav.ai': 'AI yordamchi',
      'cat.siyosat': 'Siyosat', 'cat.iqtisod': 'Iqtisod', 'cat.sport': 'Sport',
      'cat.texnologiya': 'Texnologiya', 'cat.madaniyat': 'Madaniyat', 'cat.dunyo': 'Dunyo', 'cat.jamiyat': 'Jamiyat', 'cat.digest': 'Kun xulosasi',
      menu: 'Menyu', search: 'Qidiruv', admin: 'Admin panel',
      langLabel: 'Til', themeToLight: "Yorug' rejimga o'tish", themeToDark: "Tungi rejimga o'tish",
      searchPlaceholder: 'Yangiliklarni qidiring...', nothingFound: 'Hech narsa topilmadi',
      latest: "So'nggi yangiliklar", sections: "Bo'limlar",
      backToAll: 'Barcha yangiliklar', categoryCount: n => `${n} ta yangilik`,
      emptyCategory: "Bu bo'limda hozircha yangiliklar yo'q", noNews: 'Yangiliklar topilmadi',
      loading: 'Yuklanmoqda…',
      loadError: "Yangiliklarni yuklab bo'lmadi: server ishlamayapti. Terminalda 'npm start' (yoki start.bat) ni ishga tushirib, sahifani http://localhost:3000 orqali oching.", retry: 'Qayta urinish',
      // AI
      aiTitle: 'AI Yangilik Yordamchisi', aiSub: "Yangiliklarni o'qing, tahlil qiling yoki savol bering",
      aiHello: "Assalomu alaykum! Men UZ News AI yordamchisiman. Sizga yangiliklar haqida savol berishingiz, qisqacha xulosa so'rashingiz yoki ma'lumotlarni tahlil qilishingiz mumkin.",
      aiPlaceholder: "Masalan: Bugungi asosiy yangiliklar nima? yoki Siyosat bo'yicha xulosa...",
      aiSug1: 'Bugungi asosiy yangiliklar', aiSug1q: 'Bugungi asosiy yangiliklar nima?',
      aiSug2: 'Siyosat xulosasi', aiSug2q: "Siyosat bo'yicha eng muhim yangiliklar",
      aiSug3: 'Sport yangiliklari', aiSug3q: 'Sport yangiliklarini qisqacha ayt',
      aiThinking: "O'ylayapman...",
      aiTop: 'Bugungi asosiy yangiliklar:', aiCat: (name, n) => `${name} bo'yicha yangiliklar (${n} ta):`,
      aiNoCat: name => `Hozircha "${name}" bo'yicha yangiliklar yo'q.`,
      aiStats: 'Statistika:', aiTotal: 'Jami yangiliklar', aiPcs: 'ta',
      aiSummary: 'Qisqacha tahlil:',
      aiSummaryText: (n, cat, c) => `Hozirda saytda <strong>${n}</strong> ta yangilik mavjud. Eng ko'p yangilik <strong>${cat}</strong> bo'limida (${c} ta).`,
      aiLatest: "Eng so'nggi yangilik",
      aiGreet: "Assalomu alaykum! Men UZ News AI yordamchisiman. Sizga yangiliklar haqida yordam berishga tayyorman. Savolingizni bering!",
      aiFound: q => `"${q}" bo'yicha topilgan yangiliklar:`,
      aiNotFound: q => `Kechirasiz, "${q}" bo'yicha aniq ma'lumot topilmadi. Quyidagilarni so'rashingiz mumkin:<br><br>• Bugungi asosiy yangiliklar<br>• Siyosat / Sport / Iqtisod xulosasi<br>• Yangiliklar soni<br>• Yoki ma'lum bir mavzu bo'yicha qidiruv`,
      // footer
      footerAbout: "O'zbekiston va dunyo yangiliklarining ishonchli manbai. Tezkor, aniq va xolis axborot.",
      footerSections: "Bo'limlar", footerCompany: 'Kompaniya', footerSocial: 'Ijtimoiy tarmoqlar',
      about: 'Biz haqimizda', contact: 'Aloqa', ads: 'Reklama', privacy: 'Maxfiylik',
      rights: '© 2026 UZ News. Barcha huquqlar himoyalangan.',
      // dates
      justNow: 'hozirgina', minAgo: n => `${n} daqiqa oldin`, hoursAgo: n => `${n} soat oldin`, yesterday: 'kecha',
      // weather
      wLoading: 'Ob-havo…', wUnavailable: "Ob-havo mavjud emas", wRetry: 'Qayta urinish',
      wFeels: 'His etiladi', wHumidity: 'Namlik', wWind: 'Shamol', wKmh: 'km/soat',
      wForecast: 'Keyingi kunlar', wToday: 'Bugun', wDetect: 'Joylashuvimni aniqlash', wDetecting: 'Aniqlanmoqda…',
      wChooseCity: 'Shaharni tanlang', wMyPlace: 'Mening joylashuvim', wGeoDenied: "Joylashuvga ruxsat berilmadi. Shaharni ro'yxatdan tanlang.",
      wAuto: 'Joylashuv bo\'yicha', wClose: 'Yopish',
      w0: 'Ochiq', w1: 'Asosan ochiq', w2: 'Qisman bulutli', w3: 'Bulutli', w45: 'Tumanli', w51: 'Mayda yomg\'ir',
      w61: 'Yomg\'ir', w71: 'Qor', w80: 'Jala', w85: 'Qor yog\'ishi', w95: 'Momaqaldiroq'
    },
    ru: {
      tagline: 'UZ News — самые оперативные новости Узбекистана',
      'nav.all': 'Главная', 'nav.ai': 'ИИ-помощник',
      'cat.siyosat': 'Политика', 'cat.iqtisod': 'Экономика', 'cat.sport': 'Спорт',
      'cat.texnologiya': 'Технологии', 'cat.madaniyat': 'Культура', 'cat.dunyo': 'Мир', 'cat.jamiyat': 'Общество', 'cat.digest': 'Итоги дня',
      menu: 'Меню', search: 'Поиск', admin: 'Админ-панель',
      langLabel: 'Язык', themeToLight: 'Включить светлую тему', themeToDark: 'Включить тёмную тему',
      searchPlaceholder: 'Искать новости...', nothingFound: 'Ничего не найдено',
      latest: 'Последние новости', sections: 'Разделы',
      backToAll: 'Все новости', categoryCount: n => `${n} ${plural(n, ['новость', 'новости', 'новостей'])}`,
      emptyCategory: 'В этом разделе пока нет новостей', noNews: 'Новости не найдены',
      loading: 'Загрузка…',
      loadError: "Не удалось загрузить новости: сервер не запущен. Запустите 'npm start' (или start.bat) и откройте http://localhost:3000.", retry: 'Повторить',
      aiTitle: 'ИИ-помощник по новостям', aiSub: 'Читайте новости, анализируйте или задавайте вопросы',
      aiHello: 'Здравствуйте! Я ИИ-помощник UZ News. Вы можете задавать вопросы о новостях, просить краткую сводку или анализировать данные.',
      aiPlaceholder: 'Например: Какие главные новости сегодня? или Итоги по политике...',
      aiSug1: 'Главные новости сегодня', aiSug1q: 'Какие главные новости сегодня?',
      aiSug2: 'Итоги по политике', aiSug2q: 'Самые важные новости политики',
      aiSug3: 'Новости спорта', aiSug3q: 'Кратко расскажи о новостях спорта',
      aiThinking: 'Думаю...',
      aiTop: 'Главные новости сегодня:', aiCat: (name, n) => `Новости раздела «${name}» (${n}):`,
      aiNoCat: name => `Пока нет новостей в разделе «${name}».`,
      aiStats: 'Статистика:', aiTotal: 'Всего новостей', aiPcs: 'шт.',
      aiSummary: 'Краткий анализ:',
      aiSummaryText: (n, cat, c) => `Сейчас на сайте <strong>${n}</strong> ${plural(n, ['новость', 'новости', 'новостей'])}. Больше всего новостей в разделе <strong>${cat}</strong> (${c}).`,
      aiLatest: 'Последняя новость',
      aiGreet: 'Здравствуйте! Я ИИ-помощник UZ News. Готов помочь с новостями. Задавайте вопрос!',
      aiFound: q => `Найденные новости по запросу «${q}»:`,
      aiNotFound: q => `К сожалению, по запросу «${q}» ничего не найдено. Можно спросить:<br><br>• Главные новости сегодня<br>• Итоги по политике / спорту / экономике<br>• Количество новостей<br>• Или поиск по конкретной теме`,
      footerAbout: 'Надёжный источник новостей Узбекистана и мира. Оперативная, точная и беспристрастная информация.',
      footerSections: 'Разделы', footerCompany: 'Компания', footerSocial: 'Социальные сети',
      about: 'О нас', contact: 'Контакты', ads: 'Реклама', privacy: 'Конфиденциальность',
      rights: '© 2026 UZ News. Все права защищены.',
      justNow: 'только что', minAgo: n => `${n} мин. назад`, hoursAgo: n => `${n} ч. назад`, yesterday: 'вчера',
      wLoading: 'Погода…', wUnavailable: 'Погода недоступна', wRetry: 'Повторить',
      wFeels: 'Ощущается', wHumidity: 'Влажность', wWind: 'Ветер', wKmh: 'км/ч',
      wForecast: 'Ближайшие дни', wToday: 'Сегодня', wDetect: 'Определить моё местоположение', wDetecting: 'Определяем…',
      wChooseCity: 'Выберите город', wMyPlace: 'Моё местоположение', wGeoDenied: 'Нет доступа к геолокации. Выберите город из списка.',
      wAuto: 'По геолокации', wClose: 'Закрыть',
      w0: 'Ясно', w1: 'Преимущественно ясно', w2: 'Переменная облачность', w3: 'Пасмурно', w45: 'Туман', w51: 'Морось',
      w61: 'Дождь', w71: 'Снег', w80: 'Ливень', w85: 'Снегопад', w95: 'Гроза'
    }
  };

  const MONTHS = {
    uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
    ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
  };
  const WEEKDAYS = {
    uz: ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'],
    ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  };

  function getLang() {
    try {
      const l = localStorage.getItem(LANG_KEY);
      if (l === 'uz' || l === 'ru') return l;
    } catch (e) {}
    return 'uz';
  }

  function longDate(date) {
    const l = getLang();
    const d = new Date(date);
    return l === 'ru'
      ? `${d.getDate()} ${MONTHS.ru[d.getMonth()]} ${d.getFullYear()} г.`
      : `${d.getFullYear()}-yil ${d.getDate()}-${MONTHS.uz[d.getMonth()]}`;
  }

  function weekday(date) {
    return WEEKDAYS[getLang()][new Date(date).getDay()];
  }

  function t(key, ...args) {
    const dict = STR[getLang()] || STR.uz;
    let v = dict[key];
    if (v === undefined) v = STR.uz[key];
    if (v === undefined) return key;
    return typeof v === 'function' ? v(...args) : v;
  }

  function applyStaticI18n(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  }

  function syncLangButtons() {
    const l = getLang();
    document.querySelectorAll('[data-lang]').forEach(b => {
      const on = b.dataset.lang === l;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const sw = document.querySelector('.lang-switch');
    if (sw) sw.dataset.active = l;
  }

  function setLang(l) {
    if (l !== 'uz' && l !== 'ru') return;
    try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
    document.documentElement.lang = l;
    applyStaticI18n();
    syncLangButtons();
    updateThemeButton();
    document.dispatchEvent(new CustomEvent('langchange', { detail: l }));
  }

  // ----- Theme -----
  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function updateThemeButton() {
    const btn = document.getElementById('themeBtn');
    if (!btn) return;
    const label = getTheme() === 'dark' ? t('themeToLight') : t('themeToDark');
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  function setTheme(theme, animate, persist = true) {
    const root = document.documentElement;
    if (animate) {
      root.classList.add('theme-anim');
      setTimeout(() => root.classList.remove('theme-anim'), 450);
    }
    root.setAttribute('data-theme', theme);
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (e) {} }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1220' : '#ffffff');
    updateThemeButton();
    document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  }

  function initI18nAndTheme() {
    document.documentElement.lang = getLang();
    applyStaticI18n();
    syncLangButtons();
    updateThemeButton();

    document.querySelectorAll('[data-lang]').forEach(b => {
      b.addEventListener('click', () => setLang(b.dataset.lang));
    });
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', () => setTheme(getTheme() === 'dark' ? 'light' : 'dark', true));

    // Follow the OS setting until the visitor picks a theme manually
    try {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem(THEME_KEY)) setTheme(e.matches ? 'dark' : 'light', true, false);
      });
    } catch (e) {}
  }

  window.UZ_I18N = { STR, t, getLang, longDate, weekday, setLang, getTheme, setTheme, plural, applyStaticI18n, init: initI18nAndTheme };
  window.t = t;
  window.getLang = getLang;
})();
