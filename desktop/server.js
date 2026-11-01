/* Free Agent · servidor estático embutido (Electron)
   Serve os arquivos do app numa porta FIXA — origem estável, então o
   localStorage (chaves, notas, tarefas, token do Telegram) persiste entre
   aberturas. Sem dependência nenhuma: só node:http / node:fs.
   Separado do main.js de propósito: pode ser testado com Node puro. */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function send(res, code, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(buf);
}

function downloadFileWithRedirect(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    function get(currentUrl, hops) {
      if (hops > 8) return reject(new Error('Muitos redirecionamentos'));
      const mod = currentUrl.startsWith('https:') ? https : http;
      mod.get(currentUrl, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const nextUrl = new URL(res.headers.location, currentUrl).href;
          res.resume();
          return get(nextUrl, hops + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let loaded = 0;
        const fileStream = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
          loaded += chunk.length;
          if (onProgress) onProgress(loaded, total);
        });
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(resolve);
        });
        fileStream.on('error', (err) => {
          fs.unlink(dest, () => reject(err));
        });
      }).on('error', reject);
    }
    get(url, 0);
  });
}

/** Cria (mas não inicia) o servidor que serve `root`. */
function createStaticServer(root, options = {}) {
  const ROOT = path.resolve(root);
  const modelsDir = path.join(ROOT, 'voice-server', 'models');
  const onnxFile = path.join(modelsDir, 'kokoro-v1.0.onnx');
  const voicesFile = path.join(modelsDir, 'voices-v1.0.bin');

  const downloadState = {
    isDownloading: false,
    file: '',
    loaded: 0,
    total: 370435312,
    pct: 0,
    done: false,
    error: null,
  };

  async function startKokoroDownload() {
    if (downloadState.isDownloading) return;
    downloadState.isDownloading = true;
    downloadState.done = false;
    downloadState.error = null;
    downloadState.pct = 0;
    downloadState.loaded = 0;

    if (!fs.existsSync(modelsDir)) {
      try { fs.mkdirSync(modelsDir, { recursive: true }); } catch {}
    }

    const files = [
      { name: 'voices-v1.0.bin', url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin', size: 28214398 },
      { name: 'kokoro-v1.0.onnx', url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx', size: 342220914 },
    ];

    const totalAll = files.reduce((acc, f) => acc + f.size, 0);
    downloadState.total = totalAll;
    let loadedPrior = 0;

    try {
      let onnxExists = false, voicesExists = false;
      try {
        onnxExists = fs.existsSync(onnxFile) && fs.statSync(onnxFile).size > 1000000;
        voicesExists = fs.existsSync(voicesFile) && fs.statSync(voicesFile).size > 1000000;
      } catch {}

      if (onnxExists && voicesExists) {
        downloadState.isDownloading = false;
        downloadState.done = true;
        downloadState.pct = 100;
        downloadState.loaded = totalAll;
        if (typeof options.onKokoroDownloaded === 'function') {
          try { options.onKokoroDownloaded(); } catch (err) { console.warn('[kokoro-download] Callback error:', err); }
        }
        return;
      }

      for (const f of files) {
        downloadState.file = f.name;
        const targetPath = path.join(modelsDir, f.name);
        const tempPath = targetPath + '.downloading';

        await downloadFileWithRedirect(f.url, tempPath, (loaded) => {
          downloadState.loaded = loadedPrior + loaded;
          downloadState.pct = Math.min(99, Math.round((downloadState.loaded / totalAll) * 100));
        });

        if (fs.existsSync(targetPath)) {
          try { fs.unlinkSync(targetPath); } catch {}
        }
        fs.renameSync(tempPath, targetPath);
        loadedPrior += f.size;
      }

      downloadState.isDownloading = false;
      downloadState.done = true;
      downloadState.pct = 100;
      downloadState.loaded = totalAll;

      if (typeof options.onKokoroDownloaded === 'function') {
        try { options.onKokoroDownloaded(); } catch (err) { console.warn('[kokoro-download] Callback error:', err); }
      }
    } catch (err) {
      downloadState.isDownloading = false;
      downloadState.error = err.message || String(err);
      console.error('[kokoro-download] Falha no download:', err);
    }
  }

  return http.createServer((req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      let p = decodeURIComponent(u.pathname);

      if (p === '/health') {
        return send(res, 200, JSON.stringify({ ok: true, app: 'free-agent', root: ROOT }), 'application/json');
      }

      if (p === '/api/kokoro/status') {
        let onnxExists = false, voicesExists = false;
        try {
          onnxExists = fs.existsSync(onnxFile) && fs.statSync(onnxFile).size > 1000000;
          voicesExists = fs.existsSync(voicesFile) && fs.statSync(voicesFile).size > 1000000;
        } catch {}
        return send(res, 200, JSON.stringify({
          ok: true,
          modelsExist: onnxExists && voicesExists,
          onnx: onnxExists,
          voices: voicesExists,
          isDownloading: downloadState.isDownloading,
          progress: {
            file: downloadState.file,
            loaded: downloadState.loaded,
            total: downloadState.total,
            pct: downloadState.pct,
          },
          done: downloadState.done,
          error: downloadState.error,
        }), 'application/json');
      }

      if (p === '/api/kokoro/download' && req.method === 'POST') {
        if (!downloadState.isDownloading) {
          startKokoroDownload();
        }
        return send(res, 200, JSON.stringify({ ok: true, isDownloading: true }), 'application/json');
      }

      if (p === '/api/kokoro/start-server' && req.method === 'POST') {
        if (typeof options.onKokoroDownloaded === 'function') {
          try { options.onKokoroDownloaded(); } catch {}
        }
        return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
      }

      if (p.endsWith('/')) p += 'index.html';
      if (p === '') p = '/index.html';

      const fsPath = path.normalize(path.join(ROOT, p));
      if (fsPath !== ROOT && !fsPath.startsWith(ROOT + path.sep)) {
        return send(res, 403, 'fora da raiz');
      }

      fs.stat(fsPath, (err, st) => {
        if (err || !st.isFile()) return send(res, 404, 'nao encontrado');
        const type = MIME[path.extname(fsPath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
        const rs = fs.createReadStream(fsPath);
        rs.on('error', () => { try { res.destroy(); } catch {} });
        rs.pipe(res);
      });
    } catch (e) {
      send(res, 500, 'erro interno');
    }
  });
}

module.exports = { createStaticServer, MIME };
