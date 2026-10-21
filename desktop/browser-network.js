// JavaScript, desktop/browser-network.js, Node; pinned public-IP egress proxy.
'use strict';
const http = require('node:http');
const net = require('node:net');
const dns = require('node:dns').promises;
const { publicAddress, publicUrl } = require('./browser-policy');

function createBrowserNetwork({ lookup = host => dns.lookup(host, { all: true }) } = {}) {
  const sockets = new Set();
  let closed = false;
  function track(socket) {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    return socket;
  }
  async function resolveAll(host) {
    host = host.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) {
      if (!publicAddress(host)) throw new Error('Private address');
      return [{ address: host, family: net.isIP(host) }];
    }
    let timer;
    try {
      const addresses = await Promise.race([lookup(host), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('DNS timeout')), 5000); timer.unref();
      })]);
      if (!addresses.length || !addresses.every(item => publicAddress(item.address))) throw new Error('Private DNS answer');
      return addresses.slice(0, 8).sort((a, b) => a.family - b.family);
    } finally { clearTimeout(timer); }
  }
  async function resolve(host) { return (await resolveAll(host))[0]; }
  async function connect(host, port) {
    const targets = await resolveAll(host);
    if (closed) throw new Error('Proxy closed');
    for (const target of targets) {
      if (closed) throw new Error('Proxy closed');
      try {
        return await new Promise((accept, reject) => {
          const socket = track(net.connect({ host: target.address, family: target.family, port: Number(port) }));
          const timer = setTimeout(() => { socket.destroy(); reject(new Error('Connect timeout')); }, 4000);
          socket.once('error', error => { clearTimeout(timer); reject(error); });
          socket.once('connect', () => { clearTimeout(timer); accept(socket); });
        });
      } catch { /* Retry another validated public IP, before sending any request. */ }
    }
    throw new Error('No public address reachable');
  }
  function pinnedAgent(socket) {
    const agent = new http.Agent({ keepAlive: false });
    agent.createConnection = () => socket;
    return agent;
  }
  function headers(input, host) {
    const result = { ...input, host };
    delete result['proxy-authorization']; delete result['proxy-connection'];
    return result;
  }
  const server = http.createServer(async (request, response) => {
    try {
      if (!publicUrl(request.url) || new URL(request.url).protocol !== 'http:') throw new Error('Blocked URL');
      const url = new URL(request.url);
      const socket = await connect(url.hostname, url.port || 80);
      if (request.destroyed) { socket.destroy(); return; }
      // No second hostname lookup: connect to exactly the validated IP.
      const upstream = http.request({ hostname: url.hostname,
        port: url.port || 80, method: request.method, path: url.pathname + url.search,
        headers: headers(request.headers, url.host), agent: pinnedAgent(socket) }, incoming => {
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(response);
      });
      upstream.setTimeout(30000, () => upstream.destroy());
      upstream.on('socket', track);
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      request.on('aborted', () => upstream.destroy());
      response.on('close', () => upstream.destroy());
      request.pipe(upstream);
    } catch { response.writeHead(403); response.end('Destination blocked by Free Agent network isolation.'); }
  });
  server.on('connect', async (request, client, head) => {
    track(client);
    try {
      if (!publicUrl('https://' + request.url)) throw new Error('Blocked tunnel');
      const url = new URL('https://' + request.url);
      const upstream = await connect(url.hostname, url.port || 443);
      if (client.destroyed) { upstream.destroy(); return; }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream); upstream.pipe(client);
      upstream.once('error', () => client.destroy());
      client.once('close', () => upstream.destroy());
      upstream.once('close', () => client.destroy());
    } catch { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
  });
  server.on('upgrade', async (request, client, head) => {
    track(client);
    try {
      if (!publicUrl(request.url, true)) throw new Error('Blocked WebSocket');
      const url = new URL(request.url);
      if (!['http:', 'ws:'].includes(url.protocol)) throw new Error('Blocked upgrade');
      const socket = await connect(url.hostname, url.port || 80);
      if (client.destroyed) { socket.destroy(); return; }
      const upstream = http.request({ hostname: url.hostname,
        port: url.port || 80, path: url.pathname + url.search,
        headers: headers(request.headers, url.host), agent: pinnedAgent(socket) });
      upstream.on('socket', track);
      upstream.setTimeout(15000, () => upstream.destroy());
      upstream.on('upgrade', (incoming, socket, extra) => {
        client.write(`HTTP/1.1 ${incoming.statusCode} ${incoming.statusMessage}\r\n`);
        for (const [key, value] of Object.entries(incoming.headers)) {
          for (const part of Array.isArray(value) ? value : [value]) client.write(`${key}: ${part}\r\n`);
        }
        client.write('\r\n');
        if (extra.length) client.write(extra);
        if (head.length) socket.write(head);
        socket.pipe(client); client.pipe(socket);
        socket.once('close', () => client.destroy());
        client.once('close', () => socket.destroy());
      });
      upstream.on('response', () => client.destroy());
      upstream.on('error', () => client.destroy());
      client.once('close', () => upstream.destroy());
      upstream.end();
    } catch { client.destroy(); }
  });
  server.on('connection', track);
  server.on('clientError', (_, socket) => socket.destroy());
  return {
    resolve,
    async start() {
      await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
      return server.address().port;
    },
    close() { closed = true; for (const socket of sockets) socket.destroy(); server.close(); }
  };
}
module.exports = { createBrowserNetwork };
