// UZ News - shared data helpers (categories + API client).
// News now lives in the SQL database on the server; this file only talks to it.

const CATEGORIES = [
  { id: "siyosat", name: "Siyosat", icon: "fa-landmark", color: "#1e4d8c" },
  { id: "iqtisod", name: "Iqtisod", icon: "fa-chart-line", color: "#059669" },
  { id: "sport", name: "Sport", icon: "fa-futbol", color: "#dc2626" },
  { id: "texnologiya", name: "Texnologiya", icon: "fa-microchip", color: "#7c3aed" },
  { id: "madaniyat", name: "Madaniyat", icon: "fa-masks-theater", color: "#d97706" },
  { id: "dunyo", name: "Dunyo", icon: "fa-globe", color: "#0284c7" },
  { id: "jamiyat", name: "Jamiyat", icon: "fa-users", color: "#be185d" }
];

// JSON request helper. Throws an Error (with .status) when the server answers with an error.
async function apiFetch(url, options = {}) {
  const opts = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}) } };
  if (opts.body !== undefined && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
  }
  if (opts.body !== undefined) opts.headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    const err = new Error('Serverga ulanib bo\'lmadi');
    err.status = 0;
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || ('HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

function fetchNews() {
  return apiFetch('/api/news');
}

function getCategoryName(id) {
  const cat = CATEGORIES.find(c => c.id === id);
  return cat ? cat.name : id;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now - date) / 1000; // seconds

  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return mins <= 1 ? "hozirgina" : `${mins} daqiqa oldin`;
  } else if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours} soat oldin`;
  } else if (diff < 172800) {
    return "kecha";
  } else {
    return date.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
