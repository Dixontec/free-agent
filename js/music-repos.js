/* Free Agent · Repositórios gratuitos de música (sem chave, 100% CORS-friendly)
   Fontes com download legal: Internet Archive (CC/netlabels) + Wikimedia Commons (CC).
   + lista curada p/ busca manual. Exposto como window.MusicRepos.
*/
'use strict';
(function () {
  const IA_SEARCH = 'https://archive.org/advancedsearch.php';
  const IA_META = id => `https://archive.org/metadata/${encodeURIComponent(id)}`;
  const IA_DL = (id, name) => `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(name)}`;
  const WIKI_API = 'https://commons.wikimedia.org/w/api.php';

  async function fetchTimeout(url, ms = 15000, opts = {}) {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), ms);
    try { return await fetch(url, { ...opts, signal: c.signal }); }
    finally { clearTimeout(id); }
  }

  async function iaSearch(q, limit = 8) {
    const query = `(mediatype:audio) AND (${q})`;
    const u = `${IA_SEARCH}?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=${limit}&output=json`;
    const r = await fetchTimeout(u);
    if (!r.ok) throw new Error('Archive.org HTTP ' + r.status);
    const j = await r.json();
    const docs = (j.response?.docs || []).slice(0, limit);
    const out = [];
    // metadados só dos 5 primeiros p/ não estourar tempo
    for (const d of docs.slice(0, 5)) {
      try {
        const m = await (await fetchTimeout(IA_META(d.identifier), 12000)).json();
        const files = (m.files || []).filter(f => /\.(mp3|ogg|m4a)$/i.test(f.name || '') && !/[_-]vbr|_64kb|_lq/i.test(f.name));
        files.sort((a, b) => (a.size || 0) - (b.size || 0));
        const f = files.find(f => /\.mp3$/i.test(f.name)) || files[0];
        if (!f) continue;
        out.push({
          id: 'ia:' + d.identifier,
          title: d.title || m.metadata?.title || d.identifier,
          artist: d.creator || m.metadata?.creator || 'Internet Archive',
          url: IA_DL(d.identifier, f.name),
          downloadUrl: IA_DL(d.identifier, f.name),
          license: d.licenseurl || m.metadata?.licenseurl || 'CC (ver item)',
          source: 'Internet Archive',
          page: `https://archive.org/details/${encodeURIComponent(d.identifier)}`,
        });
      } catch { /* pula item com falha */ }
    }
    return out;
  }

  async function wikiSearch(q, limit = 8) {
    const u = `${WIKI_API}?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent('filetype:audio ' + q)}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url%7Csize%7Cmime&formatversion=2`;
    const r = await fetchTimeout(u);
    if (!r.ok) throw new Error('Wikimedia HTTP ' + r.status);
    const j = await r.json();
    const pages = j.query?.pages || [];
    return pages.filter(p => p.imageinfo?.[0]?.url).slice(0, limit).map(p => {
      const ii = p.imageinfo[0];
      return {
        id: 'wiki:' + p.title,
        title: (p.title || '').replace(/^File:/, '').replace(/\.\w+$/, '').replace(/[_-]/g, ' '),
        artist: 'Wikimedia Commons',
        url: ii.url, downloadUrl: ii.url,
        license: 'CC (ver página do arquivo)',
        source: 'Wikimedia',
        page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      };
    });
  }

  // packs de demonstração offline (sempre tocam, mesmo sem busca)
  const DEMO = [
    { id: 'demo:kevin-carefree', title: 'Carefree — Kevin MacLeod', artist: 'Incompetech (CC-BY)', url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3', downloadUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3', license: 'CC-BY 4.0', source: 'Incompetech', page: 'https://incompetech.com/music/royalty-free/music.html' },
    { id: 'demo:kevin-mellow', title: 'Mellowtron — Kevin MacLeod', artist: 'Incompetech (CC-BY)', url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Mellowtron.mp3', downloadUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Mellowtron.mp3', license: 'CC-BY 4.0', source: 'Incompetech', page: 'https://incompetech.com/music/royalty-free/music.html' },
  ];

  const REPOS = [
    { name: 'Internet Archive · Netlabels', desc: 'Milhares de álbuns CC, download direto em MP3/OGG.', url: 'https://archive.org/details/netlabels', tag: 'busca integrada' },
    { name: 'Wikimedia Commons · Áudio', desc: 'Sons e músicas CC, hotlink liberado.', url: 'https://commons.wikimedia.org/wiki/Category:Audio_files_of_music', tag: 'busca integrada' },
    { name: 'Free Music Archive', desc: 'Curadoria CC histórica. Busca manual + download.', url: 'https://freemusicarchive.org/search', tag: 'manual' },
    { name: 'ccMixter', desc: 'Samples e faixas CC p/ remix. Download após preview.', url: 'http://dig.ccmixter.org/search', tag: 'manual' },
    { name: 'Openverse · Áudio', desc: 'Busca CC do WordPress (requer login p/ API, manual é livre).', url: 'https://wordpress.org/openverse/search/audio', tag: 'manual' },
    { name: 'Incompetech (Kevin MacLeod)', desc: 'Lo-fi/CC-BY clássico, MP3 direto.', url: 'https://incompetech.com/music/royalty-free/music.html', tag: 'direto' },
    { name: 'Pixabay Music', desc: 'Grátis p/ uso (conta grátis). Busca manual.', url: 'https://pixabay.com/music/search/', tag: 'manual' },
  ];

  async function search(q, source = 'all', limit = 8) {
    q = String(q || '').trim();
    if (!q) return [];
    // 0) biblioteca local primeiro — o agente reconhece o que foi upado
    try {
      if ((source === 'all' || source === 'local') && window.LocalMusic) {
        const local = window.LocalMusic.search(q).slice(0, limit);
        if (local.length) return local;
      }
    } catch {}
    const jobs = [];
    if (source === 'all' || source === 'ia') jobs.push(iaSearch(q, limit).catch(() => []));
    if (source === 'all' || source === 'wiki') jobs.push(wikiSearch(q, limit).catch(() => []));
    const parts = await Promise.all(jobs);
    const merged = parts.flat();
    if (!merged.length) {
      const ql = q.toLowerCase();
      return DEMO.filter(d => (d.title + ' ' + d.artist).toLowerCase().includes(ql.split(' ')[0] || '')).slice(0, 4);
    }
    return merged.slice(0, limit * 2);
  }

  async function download(track) {
    const url = track.downloadUrl || track.url;
    const name = (track.title || 'musica').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) + '.mp3';
    // 1) tenta salvar na pasta autorizada do harness
    try {
      if (window.saveToWorkDir) {
        const blob = await (await fetch(url)).blob();
        const text = await blobToDataUrl(blob);
        if (typeof window.saveFileFlow === 'function') { await window.saveFileFlow(name, text, 'Música baixada'); return { ok: true, via: 'pasta' }; }
      }
    } catch { /* cai p/ download direto */ }
    // 2) download direto (funciona p/ archive/wikimedia/incompetech)
    try {
      const a = document.createElement('a');
      a.href = url; a.download = name; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      return { ok: true, via: 'download-direto' };
    } catch (e) { window.open(url, '_blank'); return { ok: true, via: 'nova-aba' }; }
  }

  function blobToDataUrl(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result); fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  window.MusicRepos = { search, download, iaSearch, wikiSearch, REPOS, DEMO };
})();
