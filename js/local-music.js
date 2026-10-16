/* My OS · Biblioteca local de música (seus arquivos, IndexedDB persistente).
   O agente enxerga via LocalMusic.search(). Classic script.
*/
'use strict';
(function () {
  const DB = 'myos-music', STORE = 'tracks';
  const mem = []; // {id,name,artist,url,downloadUrl,source,license,page,local:true}
  const urlById = new Map();

  function idb() {
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
  async function idbAll() {
    try {
      const db = await idb();
      return await new Promise((res, rej) => {
        const q = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error);
      });
    } catch { return []; }
  }
  async function idbPut(rec) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function idbDel(id) {
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    } catch {}
  }

  function prettyName(fn) {
    return String(fn || 'faixa').replace(/\.\w+$/, '').replace(/[_-]+/g, ' ').replace(/^\d+\s*[-.]?\s*/, '').trim().slice(0, 60) || 'Faixa local';
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  async function load() {
    const rows = await idbAll();
    mem.length = 0;
    urlById.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    urlById.clear();
    for (const r of rows) {
      try {
        const url = URL.createObjectURL(r.blob);
        urlById.set(r.id, url);
        mem.push({ id: r.id, title: r.title, artist: r.artist || 'meu computador', url, downloadUrl: url, license: 'arquivo local', source: 'minha biblioteca', page: '', local: true });
      } catch {}
    }
    emit();
  }

  function emit() {
    try { document.dispatchEvent(new CustomEvent('localmusic:changed', { detail: { count: mem.length } })); } catch {}
    try { window.MusicPlayer && MusicPlayer.renderLocal && MusicPlayer.renderLocal(); } catch {}
    try { window.lucide && lucide.createIcons(); } catch {}
  }

  async function addFiles(files) {
    const list = [...(files || [])].filter(f => /audio|mp3|ogg|wav|m4a|flac|opus/i.test(f.type + ' ' + f.name));
    let added = 0;
    for (const f of list) {
      const id = 'local:' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      try {
        await idbPut({ id, title: prettyName(f.name), artist: 'meu computador', blob: f, addedAt: Date.now() });
        added++;
      } catch {}
    }
    await load();
    return added;
  }

  function search(q) {
    const nq = norm(q).split(/\s+/).filter(w => w.length > 1);
    if (!nq.length) return [...mem];
    return mem
      .map(t => {
        const hay = norm(t.title + ' ' + t.artist);
        let score = 0;
        for (const w of nq) if (hay.includes(w)) score += w.length > 4 ? 2 : 1;
        return { t, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.t);
  }

  async function remove(id) { await idbDel(id); await load(); }
  function list() { return [...mem]; }

  window.LocalMusic = { list, search, addFiles, remove, load, get count() { return mem.length; } };
  load();
})();
