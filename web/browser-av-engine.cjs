'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { sanitizeOffer } = require('./rtc-policy.cjs');
const { CONTROL_COMMANDS } = require('../desktop/browser-controls');

function createBrowserEngine(options = {}, notify = () => {}, _sendframe) {
  const profileDir = path.resolve(options.profileDir || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'FreeAgent', 'browser-av'));
  const workspace = path.resolve(__dirname, '..');
  const relative = path.relative(workspace, profileDir);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('O perfil deve ficar fora do workspace.');
  let child, launching, closing = false, controller = null, sequence = 0, nextStart = 0;
  let snapshot = { tabs: [], activeId: null, downloads: [], engine: 'web', connected: false,
    diagnostic: 'Navegador audiovisual ainda não iniciado.',
    capabilities: { audio: true, video: true, transport: 'webrtc', serviceWorkers: true, downloads: true } };
  const pending = new Map();
  const publish = value => { snapshot = value; notify(structuredClone(snapshot)); };
  function rpc(command, payload = {}, timeout = 15000) {
    const target = child;
    if (!target?.connected) return Promise.reject(new Error('Worker audiovisual desconectado.'));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Tempo limite do worker audiovisual; o processo será reiniciado.')); void terminate(target); }, timeout);
      pending.set(id, { resolve, reject, timer });
      target.send({ id, command, payload }, error => {
        if (error && pending.has(id)) { clearTimeout(timer); pending.delete(id); reject(new Error('Falha de IPC audiovisual.')); }
      });
    });
  }
  async function ensure() {
    if (closing) throw new Error('Navegador encerrado.');
    if (launching) return launching;
    if (child?.connected && snapshot.connected) return;
    if (Date.now() < nextStart) throw new Error('Worker indisponível; tente novamente em instantes.');
    launching = (async () => {
      await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const args = [path.join(__dirname, 'browser-av-worker.cjs'), '--av-profile=' + profileDir];
      if (options.fixtureDirectory) args.push('--av-fixtures=' + path.resolve(options.fixtureDirectory));
      const worker = spawn(require('electron'), args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
      child = worker;
      // Drain output without forwarding Chromium diagnostics (which can contain URLs).
      worker.stdout.resume(); worker.stderr.resume(); worker.stdin.end();
      let readyResolve, readyReject;
      const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
      const timer = setTimeout(() => readyReject(new Error('Worker Electron não iniciou via IPC.')), 25000);
      worker.on('message', message => {
        if (child !== worker || !message || typeof message !== 'object') return;
        if (message.event === 'state' && message.state) publish(message.state);
        if (message.event === 'ready') readyResolve();
        if (message.event === 'fatal') readyReject(new Error('Falha ao iniciar worker audiovisual.'));
        const wait = pending.get(message.id);
        if (wait) { clearTimeout(wait.timer); pending.delete(message.id); message.error ? wait.reject(new Error(message.error)) : wait.resolve(message.result); }
      });
      worker.once('error', () => readyReject(new Error('Não foi possível executar Electron via IPC.')));
      worker.once('exit', () => {
        readyReject(new Error('Worker Electron encerrou.'));
        if (child !== worker) return;
        child = null; nextStart = Date.now() + 1000;
        for (const wait of pending.values()) { clearTimeout(wait.timer); wait.reject(new Error('Worker audiovisual desconectado.')); }
        pending.clear();
        publish({ ...snapshot, connected: false, diagnostic: closing ? 'Navegador encerrado.' : 'Worker audiovisual desconectado; solicite estado ou crie uma aba para reiniciar.' });
      });
      try { await ready; } catch (error) { await terminate(worker); throw error; } finally { clearTimeout(timer); }
    })().finally(() => { launching = null; });
    return launching;
  }
  async function terminate(worker) {
    if (!worker || worker.exitCode !== null || worker.signalCode !== null) return;
    const exited = new Promise(resolve => worker.once('exit', resolve));
    if (process.platform === 'win32' && worker.pid) {
      await new Promise(resolve => {
        const killer = spawn('taskkill', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.once('error', resolve); killer.once('exit', resolve);
      });
    } else worker.kill('SIGKILL');
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
  }
  const commands = new Set([...CONTROL_COMMANDS, 'state', 'audio-source', 'fullscreen', 'create', 'activate', 'close', 'navigate', 'back', 'forward', 'reload', 'stop', 'layout', 'input', 'rtc-offer', 'download-accept', 'download-cancel']);
  return {
    profileDir,
    state: () => structuredClone(snapshot),
    debugState: () => ({ pid: child?.pid || null, connected: snapshot.connected, controlled: Boolean(controller), profileDir }),
    control(socket) { if (controller && controller !== socket && child?.connected) void rpc('release').catch(() => {}); controller = socket; },
    release(socket) { if (controller === socket) { controller = null; if (child?.connected) void rpc('release').catch(() => {}); } },
    async command(command, payload = {}, socket) {
      if (!commands.has(command)) throw new Error('Comando audiovisual inválido.');
      if (command !== 'state' && (!controller || controller !== socket)) throw new Error('Controle do navegador necessário.');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Payload audiovisual inválido.');
      await ensure();
      if (command !== 'state' && (!controller || controller !== socket)) throw new Error('Controle do navegador alterado.');
      if (command === 'rtc-offer') {
        const sdp = await sanitizeOffer(payload.sdp);
        if (controller !== socket) throw new Error('Controle do navegador alterado.');
        return rpc(command, { sdp });
      }
      return rpc(command, payload);
    },
    async downloadFile(id) { await ensure(); return rpc('download-file', { id }); },
    async metrics() { await ensure(); return rpc('metrics'); },
    async close() {
      if (closing) return;
      closing = true; controller = null;
      if (launching) await Promise.race([launching.catch(() => {}), new Promise(resolve => setTimeout(resolve, 2000))]);
      const worker = child;
      if (!worker) return;
      const exited = new Promise(resolve => worker.once('exit', resolve));
      if (worker.connected) await rpc('shutdown', {}, 5000).catch(() => {});
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
      await terminate(worker);
    }
  };
}

module.exports = { createBrowserEngine };
