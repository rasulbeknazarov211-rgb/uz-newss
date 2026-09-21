// UZ News - Weather widget
// Weather: Open-Meteo (free, no API key). Location: browser geolocation ->
// approximate IP lookup -> Tashkent. The visitor can always pick a city manually.
(function () {
  const CITIES = [
    { id: 'toshkent', uz: 'Toshkent', ru: 'Ташкент', lat: 41.2995, lon: 69.2401 },
    { id: 'samarqand', uz: 'Samarqand', ru: 'Самарканд', lat: 39.6542, lon: 66.9597 },
    { id: 'buxoro', uz: 'Buxoro', ru: 'Бухара', lat: 39.7747, lon: 64.4286 },
    { id: 'andijon', uz: 'Andijon', ru: 'Андижан', lat: 40.7821, lon: 72.3442 },
    { id: 'namangan', uz: 'Namangan', ru: 'Наманган', lat: 40.9983, lon: 71.6726 },
    { id: 'fargona', uz: "Farg'ona", ru: 'Фергана', lat: 40.3842, lon: 71.7843 },
    { id: 'qoqon', uz: "Qo'qon", ru: 'Коканд', lat: 40.5286, lon: 70.9425 },
    { id: 'qarshi', uz: 'Qarshi', ru: 'Карши', lat: 38.8606, lon: 65.7891 },
    { id: 'termiz', uz: 'Termiz', ru: 'Термез', lat: 37.2242, lon: 67.2783 },
    { id: 'jizzax', uz: 'Jizzax', ru: 'Джизак', lat: 40.1158, lon: 67.8422 },
    { id: 'guliston', uz: 'Guliston', ru: 'Гулистан', lat: 40.4897, lon: 68.7842 },
    { id: 'navoiy', uz: 'Navoiy', ru: 'Навои', lat: 40.0844, lon: 65.3792 },
    { id: 'urganch', uz: 'Urganch', ru: 'Ургенч', lat: 41.5506, lon: 60.6317 },
    { id: 'nukus', uz: 'Nukus', ru: 'Нукус', lat: 42.4531, lon: 59.6103 }
  ];

  const LOC_KEY = 'uznews_loc';
  const CACHE_KEY = 'uznews_wx';
  const CACHE_TTL = 30 * 60 * 1000; // 30 min

  const state = {
    loc: null,          // { type:'city', id } | { type:'geo', lat, lon, approx? }
    data: null,         // parsed Open-Meteo response
    status: 'loading',  // loading | ok | error
    detecting: false,
    msg: '',
    geoLabel: {},       // { uz, ru } reverse-geocoded name for far-away coordinates
    pickToken: 0        // bumped when the visitor picks a city by hand
  };

  let root = null;
  const $ = (sel) => root.querySelector(sel);
  const lang = () => window.getLang();
  const tr = (k, ...a) => window.t(k, ...a);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- helpers ----------
  const getCity = (id) => CITIES.find(c => c.id === id);

  function coords(loc) {
    if (loc.type === 'city') {
      const c = getCity(loc.id) || CITIES[0];
      return { lat: c.lat, lon: c.lon };
    }
    return { lat: loc.lat, lon: loc.lon };
  }

  function distanceKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function nearestCity(lat, lon) {
    let best = null, bestD = Infinity;
    CITIES.forEach(c => {
      const d = distanceKm({ lat, lon }, c);
      if (d < bestD) { best = c; bestD = d; }
    });
    return { city: best, km: bestD };
  }

  function labelOf(loc) {
    const l = lang();
    if (loc.type === 'city') return (getCity(loc.id) || CITIES[0])[l];
    const { city, km } = nearestCity(loc.lat, loc.lon);
    if (km <= 60) return city[l];
    return state.geoLabel[l] || tr('wMyPlace');
  }

  function saveLoc(loc) {
    state.loc = loc;
    try { localStorage.setItem(LOC_KEY, JSON.stringify(loc)); } catch (e) {}
  }

  function loadLoc() {
    try {
      const v = JSON.parse(localStorage.getItem(LOC_KEY));
      if (v && v.type === 'city' && getCity(v.id)) return v;
      if (v && v.type === 'geo' && isFinite(v.lat) && isFinite(v.lon)) return v;
    } catch (e) {}
    return null;
  }

  // ---------- weather codes ----------
  function group(code) {
    if (code === 0) return '0';
    if (code === 1) return '1';
    if (code === 2) return '2';
    if (code === 3) return '3';
    if (code === 45 || code === 48) return '45';
    if (code >= 51 && code <= 57) return '51';
    if (code >= 61 && code <= 67) return '61';
    if (code >= 71 && code <= 77) return '71';
    if (code >= 80 && code <= 82) return '80';
    if (code === 85 || code === 86) return '85';
    if (code >= 95) return '95';
    return '3';
  }

  function iconOf(code, isDay = 1) {
    switch (group(code)) {
      case '0': case '1': return isDay ? 'fa-sun' : 'fa-moon';
      case '2': return isDay ? 'fa-cloud-sun' : 'fa-cloud-moon';
      case '3': return 'fa-cloud';
      case '45': return 'fa-smog';
      case '51': return 'fa-cloud-rain';
      case '61': return 'fa-cloud-showers-heavy';
      case '71': case '85': return 'fa-snowflake';
      case '80': return 'fa-cloud-sun-rain';
      case '95': return 'fa-cloud-bolt';
      default: return 'fa-cloud';
    }
  }

  const descOf = (code) => tr('w' + group(code));

  // ---------- network ----------
  async function fetchJson(url, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchWeather(lat, lon) {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (cache && cache.key === key && Date.now() - cache.time < CACHE_TTL) return cache.data;
    } catch (e) {}

    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lat}&longitude=${lon}`
      + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min'
      + '&timezone=auto&forecast_days=4';
    const data = await fetchJson(url);
    if (!data || !data.current || !data.daily) throw new Error('bad response');
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ key, time: Date.now(), data })); } catch (e) {}
    return data;
  }

  async function fetchGeoLabel(loc) {
    if (loc.type !== 'geo') return;
    const l = lang();
    if (nearestCity(loc.lat, loc.lon).km <= 60 || state.geoLabel[l]) return;
    try {
      const j = await fetchJson(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${loc.lat}&longitude=${loc.lon}&localityLanguage=${l}`, 5000);
      const name = j.city || j.locality || j.principalSubdivision;
      if (name) { state.geoLabel[l] = name; render(); }
    } catch (e) { /* keep generic label */ }
  }

  async function refresh() {
    if (!state.loc) return;
    state.status = state.data ? 'ok' : 'loading';
    render();
    try {
      const { lat, lon } = coords(state.loc);
      state.data = await fetchWeather(lat, lon);
      state.status = 'ok';
    } catch (e) {
      state.status = 'error';
    }
    render();
    fetchGeoLabel(state.loc);
  }

  // ---------- geolocation ----------
  function browserPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('unsupported'));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    });
  }

  async function ipPosition() {
    const j = await fetchJson('https://ipwho.is/', 5000);
    if (!j || j.success === false || !isFinite(j.latitude) || !isFinite(j.longitude)) throw new Error('ip lookup failed');
    return { lat: j.latitude, lon: j.longitude };
  }

  // manual = user pressed the button; auto = first visit
  async function detect(manual) {
    const token = state.pickToken;
    state.detecting = true;
    state.msg = '';
    render();
    let pos = null, approx = false;
    try {
      pos = await browserPosition();
    } catch (e) {
      if (manual) state.msg = tr('wGeoDenied');
      if (!manual) {
        try { pos = await ipPosition(); approx = true; } catch (e2) { /* fall through */ }
      }
    }
    state.detecting = false;
    if (!manual && token !== state.pickToken) { render(); return; } // visitor chose a city while we were waiting
    if (pos) {
      state.geoLabel = {};
      saveLoc({ type: 'geo', lat: +pos.lat.toFixed(4), lon: +pos.lon.toFixed(4), approx });
      state.msg = '';
    } else if (!manual) {
      saveLoc({ type: 'city', id: 'toshkent' }); // don't ask again on every visit
    }
    await refresh();
  }

  // ---------- render ----------
  function dayName(dateStr, i) {
    if (i === 0) return tr('wToday');
    return window.UZ_I18N.weekday(dateStr + 'T12:00:00');
  }

  function render() {
    if (!root) return;
    const wasOpen = root.classList.contains('open');
    const loc = state.loc;
    const label = loc ? labelOf(loc) : '';
    const d = state.data;
    const cur = d && d.current;

    let pill;
    if (cur) {
      pill = `<i class="fas ${iconOf(cur.weather_code, cur.is_day)} w-ico"></i>
              <span class="w-temp">${Math.round(cur.temperature_2m)}°C</span>
              <span class="w-city">${esc(label)}</span>`;
    } else if (state.status === 'error') {
      pill = `<i class="fas fa-cloud-bolt w-ico"></i><span class="w-city">${esc(tr('wUnavailable'))}</span>`;
    } else {
      pill = `<i class="fas fa-spinner fa-spin w-ico"></i><span class="w-city">${esc(tr('wLoading'))}</span>`;
    }

    let body = '';
    if (cur) {
      const days = d.daily.time.slice(1, 4).map((dt, k) => {
        const i = k + 1;
        return `<div class="w-day">
          <span>${esc(dayName(dt, i))}</span>
          <i class="fas ${iconOf(d.daily.weather_code[i])}"></i>
          <b>${Math.round(d.daily.temperature_2m_max[i])}°</b>
          <small>${Math.round(d.daily.temperature_2m_min[i])}°</small>
        </div>`;
      }).join('');
      body = `
        <div class="w-now">
          <i class="fas ${iconOf(cur.weather_code, cur.is_day)} w-big"></i>
          <div>
            <div class="w-big-temp">${Math.round(cur.temperature_2m)}°C</div>
            <div class="w-desc">${esc(descOf(cur.weather_code))}</div>
          </div>
        </div>
        <div class="w-stats">
          <div><small>${esc(tr('wFeels'))}</small><b>${Math.round(cur.apparent_temperature)}°</b></div>
          <div><small>${esc(tr('wHumidity'))}</small><b>${Math.round(cur.relative_humidity_2m)}%</b></div>
          <div><small>${esc(tr('wWind'))}</small><b>${Math.round(cur.wind_speed_10m)} ${esc(tr('wKmh'))}</b></div>
        </div>
        <div class="w-forecast-title">${esc(tr('wForecast'))}</div>
        <div class="w-forecast">${days}</div>`;
    } else if (state.status === 'error') {
      body = `<p class="w-error">${esc(tr('wUnavailable'))}</p>
              <button class="w-btn" data-act="retry"><i class="fas fa-rotate"></i> ${esc(tr('wRetry'))}</button>`;
    } else {
      body = `<p class="w-error">${esc(tr('wLoading'))}</p>`;
    }

    const geoOpt = loc && loc.type === 'geo'
      ? `<option value="geo" selected>${esc(tr('wMyPlace'))} — ${esc(label)}</option>` : '';
    const options = CITIES.map(c =>
      `<option value="${c.id}" ${loc && loc.type === 'city' && loc.id === c.id ? 'selected' : ''}>${esc(c[lang()])}</option>`).join('');

    root.innerHTML = `
      <button class="weather-pill" data-act="toggle" aria-haspopup="dialog" aria-expanded="${wasOpen}">
        ${pill}<i class="fas fa-chevron-down w-caret"></i>
      </button>
      <div class="weather-pop" role="dialog" aria-label="${esc(tr('wLoading'))}">
        <div class="w-head">
          <span><i class="fas fa-location-dot"></i> ${esc(label)}</span>
          ${loc && loc.type === 'geo' ? `<em>${esc(tr('wAuto'))}</em>` : ''}
        </div>
        ${body}
        <div class="w-loc">
          <label for="wCity">${esc(tr('wChooseCity'))}</label>
          <select id="wCity" data-act="city">${geoOpt}${options}</select>
          <button class="w-btn" data-act="detect" ${state.detecting ? 'disabled' : ''}>
            <i class="fas ${state.detecting ? 'fa-spinner fa-spin' : 'fa-crosshairs'}"></i>
            ${esc(state.detecting ? tr('wDetecting') : tr('wDetect'))}
          </button>
          ${state.msg ? `<p class="w-msg">${esc(state.msg)}</p>` : ''}
        </div>
      </div>`;
    root.classList.toggle('open', wasOpen);
  }

  function setOpen(open) {
    root.classList.toggle('open', open);
    const b = $('.weather-pill');
    if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // ---------- init ----------
  function init(el) {
    root = el;
    if (!root) return;

    root.addEventListener('click', (e) => {
      const target = e.target.closest('[data-act]');
      if (!target) return;
      const act = target.dataset.act;
      if (act === 'toggle') setOpen(!root.classList.contains('open'));
      else if (act === 'detect') detect(true);
      else if (act === 'retry') refresh();
    });

    root.addEventListener('change', (e) => {
      if (e.target.dataset.act !== 'city') return;
      const v = e.target.value;
      state.msg = '';
      state.pickToken++;
      if (v !== 'geo') saveLoc({ type: 'city', id: v });
      refresh();
    });

    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    document.addEventListener('langchange', () => {
      state.msg = '';
      render();
      if (state.loc) fetchGeoLabel(state.loc);
    });

    const stored = loadLoc();
    if (stored) {
      state.loc = stored;
      refresh();
    } else {
      // First visit: show Tashkent right away, then try to find where the visitor is.
      state.loc = { type: 'city', id: 'toshkent' };
      refresh();
      detect(false);
    }
  }

  window.UZ_WEATHER = { init, CITIES };
})();
