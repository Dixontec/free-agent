/* Free Agent · servidor estático embutido (Electron)
   Serve os arquivos do app numa porta FIXA — origem estável, então o
   localStorage (chaves, notas, tarefas, token do Telegram) persiste entre
   aberturas. Sem dependência nenhuma: só node:http / node:fs.
   Separado do main.js de propósito: pode ser testado com Node puro. */
'use strict';

const http = require('http');
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
  });
  res.end(buf);
}

/** Cria (mas não inicia) o servidor que serve `root`. */
function createStaticServer(root, options = {}) {
  const ROOT = path.resolve(root);
  const liveClients = new Set();
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      let p = decodeURIComponent(u.pathname);
      if (p === '/browser-config.json') return send(res, 200, JSON.stringify({ browserPort: options.browserPort || 47812 }), 'application/json');      if (options.liveReload && p === '/__dev_events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive' });
        res.write(': development reload\n\n'); liveClients.add(res);
        req.on('close', () => liveClients.delete(res)); return;
      }

      if (p === '/health') {
        return send(res, 200, JSON.stringify({ ok: true, app: 'free-agent', root: ROOT }), 'application/json');
      }

      if (p.endsWith('/')) p += 'index.html';
      if (p === '') p = '/index.html';

      const fsPath = path.normalize(path.join(ROOT, p));
      if (fsPath !== ROOT && !fsPath.startsWith(ROOT + path.sep)) {
        return send(res, 403, 'fora da raiz');
      }

      fs.stat(fsPath, (err, st) => {
        if (err || !st.isFile()) return send(res, 404, 'nao encontrado');
        if (options.liveReload && path.extname(fsPath) === '.html') {
          return fs.readFile(fsPath, 'utf8', (err, html) => {
            if (err) return send(res, 500, 'erro interno');
            const reload = `<script>(()=>{let opened=false;const events=new EventSource('/__dev_events');events.onopen=()=>{if(opened)location.reload();opened=true};events.onmessage=()=>location.reload()})()</script>`;
            send(res, 200, html.replace('</body>', reload + '</body>'), 'text/html; charset=utf-8');
          });
        }
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
  if (options.liveReload) {
    let timer;
    const watchers = [ROOT, path.join(ROOT, 'js')].map(directory => fs.watch(directory, (_event, file) => {
      if (!file || !/\.(html|css|js|mjs)$/.test(String(file))) return;
      clearTimeout(timer); timer = setTimeout(() => { for (const client of liveClients) client.write('data: reload\n\n'); }, 180);
    }));
    server.on('close', () => { clearTimeout(timer); for (const watcher of watchers) watcher.close(); for (const client of liveClients) client.end(); liveClients.clear(); });
  }
  return server;
}

module.exports = { createStaticServer, MIME };
