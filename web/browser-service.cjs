'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');
const legacyEngine = require('./browser-engine.cjs');
const avEngine = require('./browser-av-engine.cjs');

const DEFAULT_ORIGINS = [8080, 3000, 47811].flatMap(port => [`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
const { CONTROL_COMMANDS } = require('../desktop/browser-controls');
const COMMANDS = new Set([...CONTROL_COMMANDS.filter(c => !c.startsWith('extension-')), 'state', 'audio-source', 'fullscreen', 'create', 'activate', 'close', 'navigate', 'back', 'forward', 'reload', 'stop', 'layout', 'external', 'input', 'rtc-offer', 'download-accept', 'download-cancel']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;
const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
function keys(value, allowed, required = []) {
  return object(value) && Object.keys(value).every(k => allowed.includes(k)) && required.every(k => Object.hasOwn(value, k));
}
function validate(command, p) {
  let valid = false;
  if (['audio-source', 'blocker-update', 'state', 'back', 'forward', 'reload', 'stop', 'external'].includes(command)) valid = keys(p, []);
  if (command === 'create') valid = keys(p, ['url']) && (p.url === undefined || text(p.url, 4096) && p.url.trim().length > 0);
  if (command === 'activate' || command === 'close') valid = keys(p, ['id'], ['id']) && text(p.id, 64) && p.id.length > 0;
  if (command === 'download-accept' || command === 'download-cancel') valid = keys(p, ['id'], ['id']) && text(p.id, 64) && /^[0-9a-f-]{36}$/.test(p.id);
  if (command === 'rtc-offer') valid = keys(p, ['sdp'], ['sdp']) && text(p.sdp, 24576) && p.sdp.startsWith('v=0');
  if (command === 'navigate') valid = keys(p, ['value'], ['value']) && text(p.value, 4096) && p.value.trim().length > 0;
  if (command === 'layout') valid = keys(p, ['visible', 'x', 'y', 'width', 'height', 'scale', 'backgroundAudio'], ['visible']) &&
    typeof p.visible === 'boolean' && (p.backgroundAudio === undefined || typeof p.backgroundAudio === 'boolean') && (!p.visible && p.width === undefined || number(p.width, 0, 100000)) && (!p.visible && p.height === undefined || number(p.height, 0, 100000)) &&
    (p.x === undefined || number(p.x, -100000, 100000)) && (p.y === undefined || number(p.y, -100000, 100000)) && (p.scale === undefined || number(p.scale, 1, 2));
  if (command === 'input' && object(p)) {
    if (p.kind === 'text') valid = keys(p, ['kind', 'text'], ['text']) && text(p.text, 8192);
    if (p.kind === 'mouse') valid = keys(p, ['kind', 'eventType', 'x', 'y', 'button', 'buttons', 'clickCount', 'deltaX', 'deltaY'], ['eventType', 'x', 'y']) &&
      ['mouseMoved', 'mousePressed', 'mouseReleased', 'mouseWheel'].includes(p.eventType) && number(p.x, -100000, 100000) && number(p.y, -100000, 100000) &&
      (p.button === undefined || ['none', 'left', 'middle', 'right', 'back', 'forward'].includes(p.button)) &&
      (p.buttons === undefined || Number.isInteger(p.buttons) && number(p.buttons, 0, 31)) &&
      (p.clickCount === undefined || Number.isInteger(p.clickCount) && number(p.clickCount, 0, 3)) &&
      ['deltaX', 'deltaY'].every(k => p[k] === undefined || number(p[k], -10000, 10000)) &&
      (p.eventType !== 'mouseWheel' || Number.isFinite(p.deltaX) && Number.isFinite(p.deltaY));
    if (p.kind === 'key') valid = keys(p, ['kind', 'eventType', 'key', 'code', 'modifiers', 'windowsVirtualKeyCode', 'text'], ['eventType', 'key', 'code', 'modifiers', 'windowsVirtualKeyCode']) &&
      ['keyDown', 'keyUp'].includes(p.eventType) && text(p.key, 100) && text(p.code, 100) &&
      Number.isInteger(p.modifiers) && number(p.modifiers, 0, 15) && Number.isInteger(p.windowsVirtualKeyCode) && number(p.windowsVirtualKeyCode, 0, 65535) &&
      (p.text === undefined || text(p.text, 100));
  }
  if (command === 'normalize' || command === 'agent-navigate') valid = keys(p, ['value'], ['value']) && text(p.value, 4096);
  if (['selection', 'capture', 'ai-stop'].includes(command)) valid = keys(p, []);
  if (command === 'observe') valid = keys(p, ['offset','textOffset']) && ['offset','textOffset'].every(k => p[k] === undefined || Number.isInteger(p[k]) && number(p[k],0,k==='offset'?160:500000));
  if (command === 'permission-set') valid = keys(p, ['origin','resource','decision'], ['origin','resource','decision']) && text(p.origin,4096) && ['camera','microphone','geolocation','notifications','ai'].includes(p.resource) && ['ask','once','session','always','block'].includes(p.decision);
  if (command === 'permission-answer') valid = keys(p, ['id','decision'], ['id','decision']) && text(p.id,64) && ['once','session','always','block'].includes(p.decision);
  if (command === 'fullscreen') valid=keys(p,['enabled'],['enabled'])&&typeof p.enabled==='boolean';
  if (command === 'blocker-set') valid = keys(p,['origin','enabled'],['enabled']) && typeof p.enabled === 'boolean' && (p.origin === undefined || text(p.origin,4096));
  if (command === 'agent-action') valid = keys(p,['observation','action','element','text','deltaY','expectedText'],['observation','action']) && text(p.observation,64) && ['click','fill','scroll'].includes(p.action) && (p.element === undefined || text(p.element,8)) && (p.text === undefined || text(p.text,8192)) && (p.expectedText === undefined || text(p.expectedText,300)) && (p.deltaY === undefined || number(p.deltaY,-2000,2000));
  if (!valid) throw new Error('Payload inválido.');
}
function equalToken(value, token) {
  if (typeof value !== 'string') return false;
  const a = Buffer.from(value), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function startBrowserService(options = {}) {
  const requestedPort = options.port ?? 47812;
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new Error('Porta inválida.');
  const origins = new Set(options.origins ?? DEFAULT_ORIGINS);
  if (!origins.size || [...origins].some(origin => {
    try { const u = new URL(origin); return !['http:', 'https:'].includes(u.protocol) || u.origin !== origin; } catch { return true; }
  })) throw new Error('Origins devem ser origens HTTP(S) exatas.');
  const token = crypto.randomBytes(32).toString('hex');
  const clients = new Set(), connections = new Set();
  let port, controller = null, shuttingDown = false, closePromise;
  const send = (socket, message) => {
    if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount <= 512 * 1024) socket.send(JSON.stringify(message));
  };
  const engine = (options.engine === 'jpeg' ? legacyEngine : avEngine).createBrowserEngine(options, state => {
    for (const socket of clients) if (socket.authenticated) send(socket, { type: 'state', state: { ...state, controlling: socket === controller,
      diagnostic: socket === controller ? state.diagnostic : 'Outra janela controla esta sessão. O controle será transferido quando ela desconectar.' } });
  }, send);
  function approved(req) {
    return [ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host) &&
      typeof req.headers.origin === 'string' && origins.has(req.headers.origin) &&
      req.rawHeaders.filter((_, i) => i % 2 === 0).filter(k => /^(host|origin)$/i.test(k)).length === 2;
  }
  function json(res, code, body, origin) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    res.writeHead(code, headers); res.end(JSON.stringify(body));
  }
  const server = http.createServer(async (req, res) => {
    if (!approved(req)) { json(res, 403, { error: 'Origem ou Host não autorizado.' }); return; }
    const origin = req.headers.origin;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store',
        'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization' }); res.end(); return;
    }
    if (req.method === 'GET' && req.url === '/bootstrap') {
      json(res, 200, { protocol: 'free-agent-browser/2', token, engine: 'web', diagnostic: engine.state().diagnostic, capabilities: engine.state().capabilities }, origin); return;
    }
    if (req.url.startsWith('/download/')) {
      if (!equalToken(req.headers.authorization?.replace(/^Bearer /, ''), token) || !req.headers.authorization?.startsWith('Bearer ')) {
        json(res, 401, { error: 'Autenticação necessária.' }, origin); return;
      }
      const id = req.url.slice('/download/'.length);
      const record = engine.state().downloads.find(item => item.id === id && item.state === 'completed');
      if (req.method !== 'GET' || !/^[0-9a-f-]{36}$/.test(id) || !record || !engine.downloadFile) {
        json(res, 404, { error: 'Download não disponível.' }, origin); return;
      }
      try {
        const file = await fsp.realpath(await engine.downloadFile(id));
        const root = await fsp.realpath(path.join(engine.profileDir, 'download-staging'));
        if (path.dirname(file) !== root || path.basename(file) !== id) throw new Error('Invalid staging path');
        const stat = await fsp.stat(file);
        if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error('Invalid staging size');
        const name = String(record.name).replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 180) || 'download';
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, '%27')}`,
          'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length',
          Vary: 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        const stream = fs.createReadStream(file);
        stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
      } catch { if (!res.headersSent) json(res, 404, { error: 'Download não disponível.' }, origin); else res.destroy(); }
      return;
    }
    json(res, 404, { error: 'Rota inexistente; RPC disponível em /session via WebSocket.' }, origin);
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  server.on('connection', socket => { connections.add(socket); socket.on('close', () => connections.delete(socket)); });
  server.on('clientError', (_, socket) => socket.destroy());
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    if (shuttingDown || !approved(req) || req.url !== '/session') {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', socket => {
    clients.add(socket);
    let queue = Promise.resolve(), pending = 0, windowStart = Date.now(), inputs = 0, commands = 0;
    const authTimer = setTimeout(() => socket.close(1008, 'Authentication timeout'), 3000);
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(authTimer); clients.delete(socket);
      if (controller === socket) {
        controller = null; engine.release(socket);
        const next = [...clients].find(client => client.authenticated && client.readyState === WebSocket.OPEN);
        if (next) { controller = next; engine.control(next); }
        for (const client of clients) if (client.authenticated) send(client, { type: 'state', state: { ...engine.state(), controlling: client === controller } });
      }
    });
    socket.on('message', (data, binary) => {
      let message;
      try { if (binary) throw new Error(); message = JSON.parse(data.toString()); }
      catch { socket.close(1008, 'Invalid JSON'); return; }
      if (!socket.authenticated) {
        if (!keys(message, ['type', 'token'], ['type', 'token']) || message.type !== 'auth' || !equalToken(message.token, token)) {
          socket.close(1008, 'Authentication failed'); return;
        }
        clearTimeout(authTimer); socket.authenticated = true;
        // First authenticated socket owns control until disconnect. Observers can only read state.
        if (!controller) { controller = socket; engine.control(socket); }
        send(socket, { type: 'state', state: { ...engine.state(), controlling: socket === controller } }); return;
      }
      const id = message?.id;
      try {
        if (!keys(message, ['id', 'command', 'payload'], ['id', 'command']) ||
          !(text(id, 128) && id.length || Number.isSafeInteger(id)) || !COMMANDS.has(message.command)) throw new Error('Requisição inválida.');
        validate(message.command, message.payload ?? {});
        if (message.command !== 'state' && controller !== socket) throw new Error('Outra sessão controla o navegador; reconecte após ela encerrar.');
        const now = Date.now();
        if (now - windowStart >= 1000) { windowStart = now; inputs = 0; commands = 0; }
        if (message.command === 'input' ? ++inputs > 120 : ++commands > 30) throw new Error('Limite de requisições excedido.');
        if (pending >= 64) throw new Error('Fila de requisições cheia.');
        pending++;
        queue = queue.then(async () => {
          if (shuttingDown || socket.readyState !== WebSocket.OPEN) return;
          if (message.command !== 'state' && controller !== socket) {
            send(socket, { id, error: 'Sessão sem controle do navegador.' }); return;
          }
          try { send(socket, { id, result: await engine.command(message.command, message.payload ?? {}, socket) }); }
          catch (error) { send(socket, { id, error: safeError(error) }); }
        }).catch(() => {}).finally(() => { pending--; });
      } catch (error) { send(socket, { id: typeof id === 'string' || typeof id === 'number' ? id : null, error: safeError(error) }); }
    });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(requestedPort, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    port = server.address().port;
  } catch (error) { wss.close(); await engine.close(); throw error; }
  return { port, token, host: '127.0.0.1', profileDir: engine.profileDir, state: engine.state, debugState: engine.debugState, metrics: engine.metrics,
    close() {
      if (!closePromise) closePromise = (async () => {
        shuttingDown = true;
        for (const socket of clients) socket.terminate();
        await engine.close();
        for (const socket of connections) socket.destroy();
        await Promise.all([new Promise(resolve => wss.close(resolve)), new Promise(resolve => server.close(resolve))]);
      })();
      return closePromise;
    }
  };
}
function safeError(error) {
  // Playwright errors can contain URLs and typed text. Only return our own single-line diagnostics.
  const message = String(error?.message || 'Falha do navegador.');
  return message.includes('\n') || message.includes('Input.') || message.includes('page.') || message.length > 300 ? 'Operação do navegador indisponível.' : message;
}
module.exports = { startBrowserService };

if (require.main === module) {
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) options.port = Number(args[++i]);
    else if (args[i] === '--origins' && args[i + 1]) options.origins = args[++i].split(',');
    else { console.error('Uso: node web/browser-service.cjs [--port 47812] [--origins origem1,origem2]'); process.exitCode = 1; break; }
  }
  if (!process.exitCode) startBrowserService(options).then(service => {
    console.log(`Browser web audiovisual: http://127.0.0.1:${service.port}`);
    const stop = () => { process.stdin.pause(); void service.close().catch(() => { process.exitCode = 1; }); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    process.stdin.setEncoding('utf8');
    let input = '';
    process.stdin.on('data', chunk => { input = (input + chunk).slice(-128); if (input.includes('shutdown\n')) stop(); });
    process.stdin.on('end', stop);
    process.stdin.resume();
  }).catch(() => { console.error('Não foi possível iniciar o serviço de navegador web.'); process.exitCode = 1; });
}
