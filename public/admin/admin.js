// UZ News Admin Panel — talks to the SQL database through the server API.
// Access needs the secret admin code (see the login screen).
document.addEventListener('DOMContentLoaded', () => {
  let news = [];
  let editingId = null;

  // Elements
  const body = document.body;
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const pageTitle = document.getElementById('pageTitle');
  const newsForm = document.getElementById('newsForm');
  const toast = document.getElementById('toast');
  const loginForm = document.getElementById('loginForm');
  const loginCode = document.getElementById('loginCode');
  const loginError = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ===== TOAST =====
  let toastTimer;
  function showToast(msg, type = 'success') {
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ===== API (a 401 anywhere sends the user back to the login screen) =====
  async function api(url, options) {
    try {
      return await apiFetch(url, options);
    } catch (e) {
      if (e.status === 401) showLogin();
      throw e;
    }
  }

  async function refreshNews() {
    news = await fetchNews();
  }

  // ===== LOGIN / LOGOUT =====
  function showLogin(message) {
    body.classList.remove('is-checking');
    body.classList.add('is-locked');
    loginCode.value = '';
    loginError.textContent = message || '';
    setTimeout(() => loginCode.focus(), 50);
  }

  async function enterPanel() {
    body.classList.remove('is-checking', 'is-locked');
    try {
      await refreshNews();
    } catch (e) {
      showToast(e.message, 'error');
    }
    updateDashboard();
    renderTable();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = loginCode.value.trim();
    if (!code) return;
    loginBtn.disabled = true;
    loginError.textContent = '';
    try {
      await apiFetch('/api/admin/login', { method: 'POST', body: { code } });
      loginCode.value = '';
      await enterPanel();
    } catch (err) {
      loginError.textContent = err.status === 0
        ? "Serverga ulanib bo'lmadi. Serverni ishga tushiring: npm start"
        : err.message;
      loginCode.select();
    } finally {
      loginBtn.disabled = false;
    }
  });

  async function logout() {
    try { await apiFetch('/api/admin/logout', { method: 'POST', body: {} }); } catch (e) { /* ignore */ }
    news = [];
    showLogin();
  }
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('headerLogout').addEventListener('click', logout);

  // ===== TABS =====
  document.querySelectorAll('.side-link[data-tab]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.dataset.tab;

      document.querySelectorAll('.side-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById(`tab-${tab}`).classList.add('active');

      const titles = { dashboard: 'Dashboard', news: 'Yangiliklar', add: "Yangilik qo'shish", security: 'Xavfsizlik' };
      pageTitle.textContent = titles[tab] || 'Admin';

      if (tab === 'dashboard') updateDashboard();
      if (tab === 'news') renderTable(filterCategory.value, document.getElementById('adminSearch').value);
      if (tab === 'add' && !editingId) resetForm();

      sidebar.classList.remove('open');
    });
  });

  sidebarToggle?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // ===== CATEGORY SELECT =====
  const categorySelect = document.getElementById('category');
  const filterCategory = document.getElementById('filterCategory');

  CATEGORIES.forEach(c => {
    categorySelect.innerHTML += `<option value="${esc(c.id)}">${esc(c.name)}</option>`;
    filterCategory.innerHTML += `<option value="${esc(c.id)}">${esc(c.name)}</option>`;
  });

  // ===== DASHBOARD =====
  function updateDashboard() {
    document.getElementById('statTotal').textContent = news.length;

    const totalViews = news.reduce((sum, n) => sum + (n.views || 0), 0);
    document.getElementById('statViews').textContent = totalViews.toLocaleString();
    document.getElementById('statCats').textContent = CATEGORIES.length;

    const today = new Date().toDateString();
    const todayCount = news.filter(n => new Date(n.date).toDateString() === today).length;
    document.getElementById('statToday').textContent = todayCount;

    // Category stats
    const maxCount = Math.max(...CATEGORIES.map(c => news.filter(n => n.category === c.id).length), 1);
    document.getElementById('catStats').innerHTML = CATEGORIES.map(c => {
      const count = news.filter(n => n.category === c.id).length;
      const pct = Math.round((count / maxCount) * 100);
      return `
        <div class="cat-stat-row">
          <span style="min-width:90px;font-size:13px;">${esc(c.name)}</span>
          <div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${esc(c.color)}"></div></div>
          <span class="count">${count}</span>
        </div>
      `;
    }).join('');

    // Recent news
    const recent = [...news].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    document.getElementById('recentNews').innerHTML = recent.map(n => `
      <div class="recent-item">
        <img src="${esc(n.image)}" alt="">
        <div>
          <h4>${esc(n.title)}</h4>
          <span>${esc(getCategoryName(n.category))} · ${esc(formatDate(n.date))}</span>
        </div>
      </div>
    `).join('');
  }

  // ===== NEWS TABLE =====
  function renderTable(filter = 'all', search = '') {
    let filtered = filter === 'all' ? [...news] : news.filter(n => n.category === filter);

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(q) ||
        (n.author || '').toLowerCase().includes(q)
      );
    }

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    const tbody = document.getElementById('newsTableBody');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8;">Yangiliklar topilmadi</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(n => `
      <tr>
        <td>#${n.id}</td>
        <td class="title-cell" title="${esc(n.title)}">${esc(n.title)}</td>
        <td><span class="cat-badge">${esc(getCategoryName(n.category))}</span></td>
        <td>${esc(formatDate(n.date))}</td>
        <td>${(n.views || 0).toLocaleString()}</td>
        <td class="actions-cell">
          <button class="btn-edit" data-edit="${n.id}" title="Tahrirlash"><i class="fas fa-edit"></i></button>
          <button class="btn-delete" data-delete="${n.id}" title="O'chirish"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  }

  // Search & filter
  document.getElementById('adminSearch').addEventListener('input', (e) => {
    renderTable(filterCategory.value, e.target.value);
  });
  filterCategory.addEventListener('change', () => {
    renderTable(filterCategory.value, document.getElementById('adminSearch').value);
  });

  document.getElementById('goToAdd').addEventListener('click', () => {
    document.querySelector('.side-link[data-tab="add"]').click();
  });

  // Edit / delete buttons (event delegation)
  document.getElementById('newsTableBody').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-delete]');
    if (editBtn) editNews(parseInt(editBtn.dataset.edit, 10));
    if (delBtn) deleteNews(parseInt(delBtn.dataset.delete, 10));
  });

  // ===== FORM =====
  const field = (id) => document.getElementById(id);

  function resetForm() {
    editingId = null;
    newsForm.reset();
    field('editId').value = '';
    field('author').value = 'Admin';
    field('ruFields').open = false;
    field('submitBtn').innerHTML = '<i class="fas fa-save"></i> Saqlash';
    pageTitle.textContent = "Yangilik qo'shish";
  }

  function editNews(id) {
    const article = news.find(n => n.id === id);
    if (!article) return;
    const ru = article.ru || {};

    editingId = id;
    field('editId').value = id;
    field('title').value = article.title;
    field('category').value = article.category;
    field('author').value = article.author || 'Admin';
    field('excerpt').value = article.excerpt;
    field('content').value = article.content;
    field('titleRu').value = ru.title || '';
    field('excerptRu').value = ru.excerpt || '';
    field('contentRu').value = ru.content || '';
    field('ruFields').open = !!(ru.title || ru.excerpt || ru.content);
    field('image').value = article.image || '';

    field('submitBtn').innerHTML = '<i class="fas fa-save"></i> Yangilash';
    document.querySelector('.side-link[data-tab="add"]').click();
    pageTitle.textContent = "Yangilikni tahrirlash";
  }

  async function deleteNews(id) {
    if (!confirm("Bu yangilikni o'chirishni xohlaysizmi?")) return;
    try {
      await api(`/api/admin/news/${id}`, { method: 'DELETE' });
      await refreshNews();
      renderTable(filterCategory.value, field('adminSearch').value);
      showToast("Yangilik o'chirildi");
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  field('cancelEdit').addEventListener('click', () => {
    resetForm();
    document.querySelector('.side-link[data-tab="news"]').click();
  });

  newsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      title: field('title').value.trim(),
      category: field('category').value,
      author: field('author').value.trim() || 'Admin',
      excerpt: field('excerpt').value.trim(),
      content: field('content').value.trim(),
      title_ru: field('titleRu').value.trim(),
      excerpt_ru: field('excerptRu').value.trim(),
      content_ru: field('contentRu').value.trim(),
      image: field('image').value.trim()          // empty -> the server uses the default picture
    };

    if (!payload.title || !payload.category || !payload.excerpt || !payload.content) {
      showToast("Barcha majburiy maydonlarni to'ldiring", 'error');
      return;
    }

    const submitBtn = field('submitBtn');
    submitBtn.disabled = true;
    try {
      if (editingId) {
        await api(`/api/admin/news/${editingId}`, { method: 'PUT', body: payload });
        showToast("Yangilik yangilandi!");
      } else {
        await api('/api/admin/news', { method: 'POST', body: payload });
        showToast("Yangi yangilik qo'shildi!");
      }
      await refreshNews();
      resetForm();
      document.querySelector('.side-link[data-tab="news"]').click();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ===== RESET DATA =====
  field('resetData').addEventListener('click', async () => {
    if (!confirm("Barcha yangiliklar o'chirilib, boshlang'ich yangiliklar qayta yuklanadi. Davom etasizmi?")) return;
    try {
      await api('/api/admin/reset', { method: 'POST', body: {} });
      await refreshNews();
      updateDashboard();
      renderTable();
      showToast("Ma'lumotlar qayta tiklandi");
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  // ===== CHANGE ADMIN CODE =====
  field('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const current = field('codeCurrent').value;
    const next = field('codeNew').value;
    if (next !== field('codeNew2').value) {
      showToast('Yangi kodlar bir xil emas', 'error');
      return;
    }
    try {
      await api('/api/admin/code', { method: 'POST', body: { current, next } });
      field('codeForm').reset();
      showToast('Admin kodi yangilandi');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ===== INIT: is there already a valid session? =====
  (async function boot() {
    try {
      await apiFetch('/api/admin/me');
      await enterPanel();
    } catch (e) {
      showLogin(e.status === 0 ? "Serverga ulanib bo'lmadi. Serverni ishga tushiring: npm start" : '');
    }
  })();
});
