/* Free Agent · Relógio + temperatura (NUNCA exibe localidade).
   Fonte: Open-Meteo (grátis, sem chave). Coords: cache → geolocalização → IP.
   Só renderiza hora, data e temperatura. Nenhum nome de lugar no DOM.
*/
'use strict';
(function () {
  const $ = s => document.querySelector(s);
  const store = {
    get(k, fb) { try { const v = localStorage.getItem('nexus:' + k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
    set(k, v) { try { localStorage.setItem('nexus:' + k, JSON.stringify(v)); } catch {} },
  };

  function tickClock() {
    const t = $('#cxTime'), d = $('#cxDate');
    if (!t) return;
    const n = new Date();
    const hh = String(n.getHours()).padStart(2, '0');
    const mi = String(n.getMinutes()).padStart(2, '0');
    const ss = String(n.getSeconds()).padStart(2, '0');
    t.innerHTML = `${hh}:${mi}<span class="cx-sec">:${ss}</span>`;
    if (d) d.textContent = n.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  }

  function wmoIcon(code) {
    if (code === 0) return 'sun';
    if ([1, 2].includes(code)) return 'cloud-sun';
    if (code === 3) return 'cloud';
    if ([45, 48].includes(code)) return 'cloud-fog';
    if ([51, 53, 55, 56, 57].includes(code)) return 'cloud-drizzle';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'cloud-rain';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'cloud-snow';
    if ([95, 96, 99].includes(code)) return 'cloud-lightning';
    return 'cloud';
  }

  function paintTemp(temp, code) {
    const el = $('#cxTemp');
    if (!el) return;
    if (temp === null || temp === undefined) { el.innerHTML = '<span class="cx-na">—°</span>'; return; }
    el.innerHTML = `<i data-lucide="${wmoIcon(code)}"></i><b>${Math.round(temp)}°</b>`;
    try { window.lucide && lucide.createIcons(); } catch {}
  }

  function getCoords() {
    const cached = store.get('geo', null);
    if (cached && typeof cached.lat === 'number') return Promise.resolve(cached);
    // 1) geolocalização do navegador (pede permissão 1x, guarda só números)
    const viaGeo = new Promise(res => {
      try {
        if (!navigator.geolocation) return res(null);
        navigator.geolocation.getCurrentPosition(
          p => res({ lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2) }),
          () => res(null),
          { timeout: 8000, maximumAge: 86400000 }
        );
      } catch { res(null); }
    });
    return viaGeo.then(g => {
      if (g) { store.set('geo', g); return g; }
      // 2) fallback silencioso por IP (cidade recebida nunca é exibida)
      return fetch('https://ipapi.co/json/').then(r => r.json()).then(j => {
        if (typeof j.latitude !== 'number') throw 0;
        const c = { lat: +j.latitude.toFixed(2), lon: +j.longitude.toFixed(2) };
        store.set('geo', c); return c;
      }).catch(() => null);
    });
  }

  async function refreshWx() {
    try {
      const c = await getCoords();
      if (!c) { paintTemp(null); return; }
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code&timezone=auto`;
      const r = await fetch(u);
      if (!r.ok) throw 0;
      const j = await r.json();
      paintTemp(j.current?.temperature_2m, j.current?.weather_code);
      store.set('wx', { t: j.current?.temperature_2m, c: j.current?.weather_code, at: Date.now() });
    } catch { paintTemp(null); }
  }

  let started = false;
  function init() {
    if (started) return; started = true;
    tickClock();
    setInterval(tickClock, 1000);
    const last = store.get('wx', null);
    if (last && typeof last.t === 'number') paintTemp(last.t, last.c);
    refreshWx();
    setInterval(refreshWx, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tickClock(); refreshWx(); } });
  }
  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
