// UZ News - Main Application
document.addEventListener('DOMContentLoaded', () => {
  UZ_I18N.init();
  UZ_WEATHER.init(document.getElementById('weather'));

  let news = [];                // loaded from the SQL database through /api/news
  let loadFailed = false;       // the server could not be reached
  let ready = false;            // first load finished, router may run
  let currentCategory = null;   // null = nothing rendered yet
  let openArticleId = null;
  let openedByClick = false;    // article modal was opened from inside the site (so Back can close it)
  let navToken = 0;

  // Elements
  const pageView = document.getElementById('pageView');
  const pageProgress = document.getElementById('pageProgress');
  const heroSection = document.getElementById('heroSection');
  const gridHeader = document.getElementById('gridHeader');
  const newsGrid = document.getElementById('newsGrid');
  const categoriesGrid = document.getElementById('categoriesGrid');
  const searchBtn = document.getElementById('searchBtn');
  const searchOverlay = document.getElementById('searchOverlay');
  const closeSearch = document.getElementById('closeSearch');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const menuBtn = document.getElementById('menuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const menuBackdrop = document.getElementById('menuBackdrop');
  const closeMenu = document.getElementById('closeMenu');
  const articleModal = document.getElementById('articleModal');
  const modalClose = document.getElementById('modalClose');
  const modalBody = document.getElementById('modalBody');
  const categoriesSection = document.getElementById('categoriesSection');
  const aiSection = document.getElementById('aiSection');
  const aiChat = document.getElementById('aiChat');
  const aiInput = document.getElementById('aiInput');
  const aiSend = document.getElementById('aiSend');

  // ===== HELPERS =====
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const locale = () => (getLang() === 'ru' ? 'ru-RU' : 'uz-UZ');
  const num = (n) => (Number(n) || 0).toLocaleString(locale());
  const catName = (id) => (CATEGORIES.some(c => c.id === id) ? t('cat.' + id) : id);
  const byDate = (a, b) => new Date(b.date) - new Date(a.date);

  // Text of an article in the current language. The Russian version is optional (filled in the
  // admin panel); any missing Russian field falls back to the Uzbek text.
  function L(item) {
    const base = { title: item.title || '', excerpt: item.excerpt || '', content: item.content || '' };
    if (getLang() === 'ru' && item.ru) {
      return {
        title: item.ru.title || base.title,
        excerpt: item.ru.excerpt || base.excerpt,
        content: item.ru.content || base.content
      };
    }
    return base;
  }

  const loadingHtml = () => `
    <div class="empty-state">
      <i class="fas fa-spinner fa-spin"></i>
      <p>${esc(t('loading'))}</p>
    </div>`;

  async function loadNews() {
    try {
      news = await fetchNews();
      loadFailed = false;
    } catch (e) {
      news = [];
      loadFailed = true;
    }
  }

  async function retryLoad() {
    newsGrid.innerHTML = loadingHtml();
    await loadNews();
    renderPage();
    route();
  }

  function fmtDate(dateStr) {
    const date = new Date(dateStr);
    const diff = (Date.now() - date) / 1000;
    if (diff < 3600) {
      const mins = Math.floor(diff / 60);
      return mins <= 1 ? t('justNow') : t('minAgo', mins);
    } else if (diff < 86400) {
      return t('hoursAgo', Math.floor(diff / 3600));
    } else if (diff < 172800) {
      return t('yesterday');
    }
    return UZ_I18N.longDate(date);
  }

  function attachOpen(container, selector) {
    container.querySelectorAll(selector).forEach(el => {
      const open = () => openArticle(parseInt(el.dataset.id, 10));
      el.addEventListener('click', open);
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }

  // ===== RENDER HERO =====
  function renderHero() {
    const sorted = [...news].sort(byDate);
    const main = sorted[0];
    const side = sorted.slice(1, 4);

    if (!main) {
      heroSection.innerHTML = loadFailed ? '' : `<p style="text-align:center;padding:40px;grid-column:1/-1;">${esc(t('noNews'))}</p>`;
      return;
    }
    const m = L(main);

    heroSection.innerHTML = `
      <div class="hero-main" data-id="${main.id}">
        <img src="${esc(main.image)}" alt="${esc(m.title)}" loading="lazy">
        <div class="overlay">
          <span class="category">${esc(catName(main.category))}</span>
          <h1>${esc(m.title)}</h1>
          <div class="meta">
            <span><i class="far fa-clock"></i> ${esc(fmtDate(main.date))}</span>
            <span><i class="far fa-eye"></i> ${num(main.views)}</span>
          </div>
        </div>
      </div>
      <div class="hero-side">
        ${side.map(item => { const l = L(item); return `
          <div class="hero-side-item" data-id="${item.id}">
            <img src="${esc(item.image)}" alt="${esc(l.title)}" loading="lazy">
            <div>
              <h3>${esc(l.title)}</h3>
              <div class="meta">
                <span>${esc(catName(item.category))}</span> ·
                <span>${esc(fmtDate(item.date))}</span>
              </div>
            </div>
          </div>`; }).join('')}
      </div>
    `;
    attachOpen(heroSection, '[data-id]');
  }

  // ===== HEADING ABOVE THE GRID (home title or category banner) =====
  function renderGridHeader(category) {
    if (category === 'all') {
      gridHeader.innerHTML = `<h2 class="section-title">${esc(t('latest'))}</h2>`;
      return;
    }
    const cat = CATEGORIES.find(c => c.id === category);
    const count = news.filter(n => n.category === category).length;
    gridHeader.innerHTML = `
      <div class="category-banner" style="--cat-color:${esc(cat ? cat.color : '#1e4d8c')}">
        <button type="button" class="banner-back" data-back>
          <i class="fas fa-arrow-left"></i> ${esc(t('backToAll'))}
        </button>
        <div class="banner-main">
          <div class="banner-icon"><i class="fas ${esc(cat ? cat.icon : 'fa-newspaper')}"></i></div>
          <div>
            <h1>${esc(catName(category))}</h1>
            <p>${esc(t('categoryCount', count))}</p>
          </div>
        </div>
      </div>`;
    gridHeader.querySelector('[data-back]').addEventListener('click', () => goTo('all'));
  }

  // ===== RENDER NEWS GRID =====
  function renderNews(category = 'all') {
    if (loadFailed) {
      newsGrid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-triangle-exclamation"></i>
          <p>${esc(t('loadError'))}</p>
          <button type="button" class="retry-btn" data-retry>${esc(t('retry'))}</button>
        </div>`;
      newsGrid.querySelector('[data-retry]').addEventListener('click', retryLoad);
      return;
    }
    let filtered = category === 'all' ? [...news] : news.filter(n => n.category === category);
    filtered.sort(byDate);

    // The first 4 items live in the hero on the home page
    if (category === 'all') filtered = filtered.slice(4);

    if (filtered.length === 0) {
      newsGrid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-newspaper"></i>
          <p>${esc(t('emptyCategory'))}</p>
        </div>`;
      return;
    }

    newsGrid.innerHTML = filtered.map((item, i) => {
      const l = L(item);
      return `
      <article class="news-card" data-id="${item.id}" style="animation-delay:${i * 0.08}s">
        <div class="card-img">
          <img src="${esc(item.image)}" alt="${esc(l.title)}" loading="lazy">
          <span class="card-category">${esc(catName(item.category))}</span>
        </div>
        <div class="card-body">
          <h3>${esc(l.title)}</h3>
          <p class="excerpt">${esc(l.excerpt)}</p>
          <div class="card-meta">
            <span><i class="far fa-clock"></i> ${esc(fmtDate(item.date))}</span>
            <span><i class="far fa-eye"></i> ${num(item.views)}</span>
          </div>
        </div>
      </article>`;
    }).join('');

    attachOpen(newsGrid, '.news-card');
  }

  // ===== RENDER CATEGORIES =====
  function renderCategories() {
    categoriesGrid.innerHTML = CATEGORIES.map((cat, i) => {
      const count = news.filter(n => n.category === cat.id).length;
      return `
        <div class="category-card ${currentCategory === cat.id ? 'current' : ''}" data-category="${cat.id}" style="animation-delay:${i * 0.07}s" tabindex="0" role="button">
          <div class="cat-icon"><i class="fas ${cat.icon}"></i></div>
          <h3>${esc(catName(cat.id))}</h3>
          <span>${esc(t('categoryCount', count))}</span>
        </div>`;
    }).join('');

    categoriesGrid.querySelectorAll('.category-card').forEach(el => {
      const go = () => goTo(el.dataset.category);
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
  }

  function renderPage() {
    const cat = currentCategory || 'all';
    const isAi = cat === 'ai';

    // The AI assistant has its own page: nothing else is shown next to it,
    // and it is not shown on any other page.
    aiSection.hidden = !isAi;
    gridHeader.hidden = isAi;
    newsGrid.hidden = isAi;
    categoriesSection.hidden = isAi;
    heroSection.hidden = cat !== 'all';

    if (cat === 'all') renderHero();
    if (!isAi) {
      renderGridHeader(cat);
      renderNews(cat);
    }
    renderCategories();
    setActiveNav(cat);
    updateTitle();
  }

  function setActiveNav(cat) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.category === cat));
  }

  function updateTitle() {
    const base = getLang() === 'ru' ? 'UZ News — Новости Узбекистана' : "UZ News — O'zbekiston Yangiliklari";
    if (openArticleId !== null) {
      const a = news.find(n => n.id === openArticleId);
      if (a) { document.title = `${L(a).title} — UZ News`; return; }
    }
    if (currentCategory === 'ai') { document.title = `${t('nav.ai')} — UZ News`; return; }
    document.title = (currentCategory && currentCategory !== 'all') ? `${catName(currentCategory)} — UZ News` : base;
  }

  // ===== PAGE TRANSITIONS =====
  function startProgress() {
    pageProgress.classList.remove('run', 'done');
    void pageProgress.offsetWidth; // restart the animation
    pageProgress.classList.add('run');
  }
  function finishProgress() {
    pageProgress.classList.add('done');
    setTimeout(() => pageProgress.classList.remove('run', 'done'), 700);
  }

  function showView(cat, animate) {
    const token = ++navToken;
    const apply = () => {
      currentCategory = cat;
      renderPage();
      window.scrollTo({ top: 0, behavior: 'instant' });
    };

    if (!animate) { apply(); return; }

    startProgress();
    pageView.classList.remove('is-entering');
    pageView.classList.add('is-leaving');
    setTimeout(() => {
      if (token !== navToken) return; // a newer navigation took over
      apply();
      pageView.classList.remove('is-leaving');
      pageView.classList.add('is-entering');
      finishProgress();
      setTimeout(() => { if (token === navToken) pageView.classList.remove('is-entering'); }, 600);
    }, 260);
  }

  // ===== ROUTER (#/, #/sport, #/ai, #/news/3) =====
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const m = h.match(/^news\/(\d+)/);
    if (m) return { type: 'article', id: parseInt(m[1], 10) };
    if (h === 'ai' || CATEGORIES.some(c => c.id === h)) return { type: 'category', id: h };
    return { type: 'category', id: 'all' };
  }

  function route() {
    if (!ready) return;
    const r = parseHash();
    if (r.type === 'article') {
      if (currentCategory === null) showView('all', false);
      if (!news.some(n => n.id === r.id)) {
        history.replaceState(null, '', location.pathname + location.search + '#/');
        return;
      }
      showArticle(r.id);
    } else {
      hideArticle();
      if (r.id !== currentCategory) showView(r.id, currentCategory !== null);
    }
  }

  function goTo(cat) {
    const r = parseHash();
    if (r.type === 'category' && r.id === cat) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    location.hash = cat === 'all' ? '#/' : '#/' + cat;
  }

  window.addEventListener('hashchange', route);

  // ===== ARTICLE MODAL =====
  function renderArticleBody(article) {
    const l = L(article);
    modalBody.innerHTML = `
      <img src="${esc(article.image)}" alt="${esc(l.title)}">
      <div class="modal-info">
        <span class="modal-category">${esc(catName(article.category))}</span>
        <h2>${esc(l.title)}</h2>
        <div class="modal-meta">
          <span><i class="far fa-user"></i> ${esc(article.author)}</span>
          <span><i class="far fa-clock"></i> ${esc(fmtDate(article.date))}</span>
          <span><i class="far fa-eye"></i> ${num(article.views)}</span>
        </div>
        <div class="modal-text">
          ${l.content.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('')}
        </div>
      </div>
    `;
  }

  // Every article is counted once per browser session (a page refresh does not inflate the number)
  function countView(article) {
    let seen = [];
    try { seen = JSON.parse(sessionStorage.getItem('uznews_seen') || '[]'); } catch (e) {}
    if (seen.includes(article.id)) return;
    seen.push(article.id);
    try { sessionStorage.setItem('uznews_seen', JSON.stringify(seen)); } catch (e) {}
    article.views = (article.views || 0) + 1;
    apiFetch('/api/news/' + article.id + '/view', { method: 'POST' })
      .then(r => { if (r && typeof r.views === 'number') article.views = r.views; })
      .catch(() => {});
  }

  function showArticle(id) {
    const article = news.find(n => n.id === id);
    if (!article) return;
    if (openArticleId !== id) countView(article);
    openArticleId = id;
    renderArticleBody(article);
    articleModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    updateTitle();
  }

  function hideArticle() {
    if (openArticleId === null && !articleModal.classList.contains('active')) return;
    openArticleId = null;
    openedByClick = false;
    articleModal.classList.remove('active');
    document.body.style.overflow = '';
    updateTitle();
  }

  function openArticle(id) {
    openedByClick = true;
    location.hash = '#/news/' + id;
  }

  function closeArticle() {
    if (openArticleId === null) return;
    if (openedByClick) {
      openedByClick = false;
      history.back(); // hashchange -> route() -> hideArticle()
    } else {
      // Page was opened directly on an article link: there's no page behind us to go back to
      const back = (currentCategory && currentCategory !== 'all') ? '#/' + currentCategory : '#/';
      history.replaceState(null, '', location.pathname + location.search + back);
      hideArticle();
    }
  }

  // ===== SEARCH =====
  function closeSearchOverlay() {
    searchOverlay.classList.remove('active');
    searchInput.value = '';
    searchResults.innerHTML = '';
  }

  function runSearch() {
    const q = searchInput.value.toLowerCase().trim();
    if (q.length < 2) { searchResults.innerHTML = ''; return; }
    const results = news.filter(n => {
      const ru = n.ru || {};
      const hay = [n.title, n.excerpt, n.content, ru.title, ru.excerpt, ru.content, catName(n.category), t('cat.' + n.category)]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    searchResults.innerHTML = results.length
      ? results.map(r => `
          <div class="search-result-item" data-id="${r.id}">
            <strong>${esc(L(r).title)}</strong>
            <div style="font-size:12px;opacity:0.7;margin-top:4px;">${esc(catName(r.category))} · ${esc(fmtDate(r.date))}</div>
          </div>`).join('')
      : `<div class="search-result-item" style="text-align:center;">${esc(t('nothingFound'))}</div>`;

    searchResults.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.id, 10);
        closeSearchOverlay();
        openArticle(id);
      });
    });
  }

  searchBtn.addEventListener('click', () => {
    searchOverlay.classList.add('active');
    setTimeout(() => searchInput.focus(), 100);
  });
  closeSearch.addEventListener('click', closeSearchOverlay);
  searchInput.addEventListener('input', runSearch);

  // ===== MOBILE MENU =====
  const openMenu = () => { mobileMenu.classList.add('active'); menuBackdrop.classList.add('active'); };
  const shutMenu = () => { mobileMenu.classList.remove('active'); menuBackdrop.classList.remove('active'); };
  menuBtn.addEventListener('click', openMenu);
  closeMenu.addEventListener('click', shutMenu);
  menuBackdrop.addEventListener('click', shutMenu);

  // ===== NAVIGATION =====
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      shutMenu();
      goTo(link.dataset.category);
    });
  });

  // Logo goes home through the router; placeholder links ("#") must not jump to the home page
  document.querySelectorAll('a.logo').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); goTo('all'); });
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href="#"]');
    if (a) e.preventDefault();
  });

  // ===== MODAL CLOSE =====
  modalClose.addEventListener('click', closeArticle);
  articleModal.addEventListener('click', (e) => { if (e.target === articleModal) closeArticle(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeArticle();
      closeSearchOverlay();
      shutMenu();
    }
  });

  // ===== AI ASSISTANT =====
  function addAiMessage(text, isUser = false) {
    const msg = document.createElement('div');
    msg.className = `ai-message ${isUser ? 'user' : 'bot'}`;
    msg.innerHTML = `
      <div class="msg-avatar"><i class="fas ${isUser ? 'fa-user' : 'fa-robot'}"></i></div>
      <div class="msg-content">${isUser ? esc(text) : text}</div>
    `;
    aiChat.appendChild(msg);
    aiChat.scrollTop = aiChat.scrollHeight;
  }

  // Keywords work in both languages, so the assistant understands UZ and RU questions
  const INTENT = {
    siyosat: /siyosat|политик/,
    iqtisod: /iqtisod|эконом/,
    sport: /sport|спорт|футбол/,
    texnologiya: /texnologiya|texnika|технолог|техник|искусственн|(^|[^a-z])ai([^a-z]|$)|(^|[^а-яё])ии([^а-яё]|$)/,
    madaniyat: /madaniy|культур/,
    dunyo: /dunyo|xalqaro|международ|(^|[^а-яё])мир([^а-яё]|$)/,
    jamiyat: /jamiyat|общест/
  };
  const RE_COUNT = /nechta|soni|qancha|сколько|количеств|статистик/;
  const RE_SUMMARY = /xulosa|qisqacha|tahlil|итог|кратк|анализ|сводк|обзор/;
  const RE_TOP = /asosiy|bugun|muhim|nima|главн|важн|сегодня|основн/;
  const RE_GREET = /salom|assalom|hello|привет|здравств/;

  function listItems(items, withExcerpt, limit) {
    return items.slice(0, limit || items.length).map((n, i) => {
      const l = L(n);
      const extra = withExcerpt
        ? `<br><small>${esc(l.excerpt.substring(0, 100))}${l.excerpt.length > 100 ? '...' : ''}</small>`
        : `<br><small>${esc(catName(n.category))} · ${esc(fmtDate(n.date))}</small>`;
      return `${i + 1}. <strong>${esc(l.title)}</strong>${extra}<br><br>`;
    }).join('');
  }

  function processAiQuery(query) {
    const q = query.toLowerCase();
    const sorted = [...news].sort(byDate);

    const catId = Object.keys(INTENT).find(id => INTENT[id].test(q));
    if (catId) {
      const items = sorted.filter(n => n.category === catId);
      return items.length
        ? `<strong>${esc(t('aiCat', catName(catId), items.length))}</strong><br><br>` + listItems(items, true, 4)
        : esc(t('aiNoCat', catName(catId)));
    }

    if (RE_COUNT.test(q)) {
      let r = `<strong>${esc(t('aiStats'))}</strong><br><br>${esc(t('aiTotal'))}: <strong>${news.length}</strong> ${esc(t('aiPcs'))}<br><br>`;
      CATEGORIES.forEach(c => {
        r += `${esc(catName(c.id))}: ${news.filter(n => n.category === c.id).length} ${esc(t('aiPcs'))}<br>`;
      });
      return r;
    }

    if (RE_SUMMARY.test(q)) {
      const top = CATEGORIES.map(c => ({ name: catName(c.id), count: news.filter(n => n.category === c.id).length }))
        .sort((a, b) => b.count - a.count)[0];
      let r = `<strong>${esc(t('aiSummary'))}</strong><br><br>` + t('aiSummaryText', news.length, esc(top.name), top.count);
      if (sorted[0]) r += `<br><br>${esc(t('aiLatest'))}: <em>"${esc(L(sorted[0]).title)}"</em>`;
      return r;
    }

    if (RE_TOP.test(q)) {
      return `<strong>${esc(t('aiTop'))}</strong><br><br>` + listItems(sorted.slice(0, 5), false);
    }

    if (RE_GREET.test(q)) return esc(t('aiGreet'));

    // Fall back to a text search in both languages
    const found = news.filter(n => {
      const ru = n.ru || {};
      return [n.title, n.excerpt, n.content, ru.title, ru.excerpt, ru.content].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
    if (found.length) {
      return `<strong>${esc(t('aiFound', query))}</strong><br><br>` + listItems(found, true, 4);
    }
    return t('aiNotFound', esc(query));
  }

  function handleAiSend() {
    const query = aiInput.value.trim();
    if (!query) return;
    addAiMessage(query, true);
    aiInput.value = '';

    const thinking = document.createElement('div');
    thinking.className = 'ai-message bot';
    thinking.innerHTML = `
      <div class="msg-avatar"><i class="fas fa-robot"></i></div>
      <div class="msg-content"><i class="fas fa-spinner fa-spin"></i> ${esc(t('aiThinking'))}</div>
    `;
    aiChat.appendChild(thinking);
    aiChat.scrollTop = aiChat.scrollHeight;

    setTimeout(() => {
      thinking.remove();
      addAiMessage(processAiQuery(query));
    }, 600 + Math.random() * 400);
  }

  aiSend.addEventListener('click', handleAiSend);
  aiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAiSend(); });

  document.querySelectorAll('.suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      aiInput.value = t(btn.dataset.qkey);
      handleAiSend();
    });
  });

  // ===== LANGUAGE CHANGE =====
  document.addEventListener('langchange', () => {
    renderPage();
    if (openArticleId !== null) {
      const a = news.find(n => n.id === openArticleId);
      if (a) renderArticleBody(a);
    }
    if (searchOverlay.classList.contains('active')) runSearch();
    // Quick fade so the switch is visible
    pageView.classList.remove('is-entering');
    void pageView.offsetWidth;
    pageView.classList.add('is-entering');
    setTimeout(() => pageView.classList.remove('is-entering'), 600);
  });

  // ===== INIT =====
  newsGrid.innerHTML = loadingHtml();
  loadNews().then(() => {
    ready = true;
    route();
  });
});
