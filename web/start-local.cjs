'use strict';

const path = require('node:path');
const { createStaticServer } = require('../desktop/server');

const browserPort = Number(process.env.FA_BROWSER_PORT || 47812);
if (!Number.isInteger(browserPort) || browserPort < 1024 || browserPort > 65535) throw new Error('FA_BROWSER_PORT inválida.');
const server = createStaticServer(path.resolve(__dirname, '..'), { liveReload: process.env.FA_DEV === '1', browserPort });
const sockets = new Set();
const appPort = Number(process.env.FA_APP_PORT || 47811);
if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65535) throw new Error('FA_APP_PORT inválida.');
const origins = [...new Set([8080, 3000, 47811, appPort])].flatMap(port =>
  [`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
let stopping = false;
let browserStartup = Promise.resolve(null);

server.on('connection', socket => {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
});

async function stop() {
  if (stopping) return;
  stopping = true;
  process.stdin.pause();
  const deadline = setTimeout(() => {
    console.error('Tempo limite ao encerrar os serviços locais.');
    process.exit(1);
  }, 8000);
  try {
    const closed = new Promise(resolve => server.close(resolve));
    for (const socket of sockets) socket.destroy();
    const browser = await browserStartup;
    await Promise.all([closed, browser?.close()]);
  } catch {
    console.error('Falha ao encerrar os serviços locais.');
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    // O serviço de navegador pode manter handles nativos vivos; encerramos o processo
    // só depois de fechar servidor e navegador.
    process.exit(process.exitCode || 0);
  }
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.stdin.setEncoding('utf8');
let stdinBuffer = '';
process.stdin.on('data', data => { stdinBuffer = (stdinBuffer + data).slice(-128); if (stdinBuffer.includes('shutdown\n')) { console.log('Encerrando serviços locais.'); void stop(); } });
process.stdin.on('end', () => { void stop(); });
process.stdin.resume();
server.on('error', error => {
  console.error(`Não foi possível servir o app em 127.0.0.1:${appPort} (${error.code || 'erro HTTP'}).`);
  process.exitCode = 1;
  void stop();
});
server.listen(appPort, '127.0.0.1', () => {
  if (stopping) return;
  console.log(`Free Agent em http://127.0.0.1:${appPort}`);  browserStartup = Promise.resolve().then(() => {
    const { startBrowserService } = require('./browser-service.cjs');
    return startBrowserService({ port: browserPort, origins, profileDir: process.env.FA_BROWSER_PROFILE });
  }).then(service => {
    console.log(`Browser web em http://127.0.0.1:${browserPort}`);
    return service;
  }).catch(error => {
    console.error(error.code === 'EADDRINUSE'
      ? 'Porta 47812 já está em uso. Nenhum processo foi encerrado; o app continua e o frontend validará protocolo/autenticação do serviço existente.'
      : `Serviço de navegador indisponível (${error.code || 'falha de inicialização'}); o app continua disponível.`);
    return null;
  });
});
