/* Free Agent · janela nativa (Electron)
   - Janela própria, sem barra de menus nem abas → o título em cima é só "Free Agent".
   - Sobe um servidor estático numa porta FIXA (desktop/server.js) e carrega o app
     por lá: origem estável = o localStorage (chaves, notas, tarefas, token do
     Telegram) sobrevive entre aberturas.
   - Ícone = o mesmo favicon do app (desktop/icon.png, gerado do SVG inline).
   - Links externos saem no navegador do sistema; nada de download de conteúdo. */
'use strict';

const { app, BrowserWindow, Menu, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createStaticServer } = require('./server');

const PORTA = 47811;              // fixa de propósito (origem estável p/ localStorage)
const RAIZ = path.join(__dirname, '..');
const ORIGEM = `http://127.0.0.1:${PORTA}`;

let win = null;
let server = null;
let voiceProcess = null;

function resolvePythonBinary() {
  const isWin = process.platform === 'win32';
  const candidates = [
    isWin ? path.join(RAIZ, 'voice-server', '.venv', 'Scripts', 'python.exe') : path.join(RAIZ, 'voice-server', '.venv', 'bin', 'python'),
    isWin ? path.join(RAIZ, '.venv', 'Scripts', 'python.exe') : path.join(RAIZ, '.venv', 'bin', 'python'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return isWin ? 'python' : 'python3';
}

function iniciaServidorVoz() {
  const scriptPath = path.join(RAIZ, 'voice-server', 'voice_server.py');
  if (!fs.existsSync(scriptPath)) return;

  const pythonBin = resolvePythonBinary();
  try {
    voiceProcess = spawn(pythonBin, [scriptPath], {
      cwd: path.join(RAIZ, 'voice-server'),
      detached: false,
      stdio: 'ignore',
    });

    voiceProcess.on('error', (err) => {
      console.warn('[voice-server] Falha ao iniciar processo de voz:', err.message);
      voiceProcess = null;
    });

    voiceProcess.on('exit', () => {
      voiceProcess = null;
    });
  } catch (err) {
    console.warn('[voice-server] Erro ao spawnar servidor de voz:', err.message);
  }
}

function encerraServidorVoz() {
  if (voiceProcess) {
    const proc = voiceProcess;
    voiceProcess = null;
    try {
      proc.kill('SIGTERM');
    } catch {}
    setTimeout(() => {
      try {
        if (!proc.killed) proc.kill('SIGKILL');
      } catch {}
    }, 1200);
  }
}

function sobeServidor() {
  return new Promise((resolve, reject) => {
    server = createStaticServer(RAIZ, { onKokoroDownloaded: iniciaServidorVoz });
    server.once('error', reject);
    server.listen(PORTA, '127.0.0.1', () => resolve());
  });
}

function janela() {
  win = new BrowserWindow({
    title: 'Free Agent',
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    backgroundColor: '#000000',
    icon: nativeImage.createFromPath(path.join(__dirname, 'icon.png')),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      sandbox: true,
      backgroundThrottling: false,
      webviewTag: true,
    },
  });

  Menu.setApplicationMenu(null); // sem menu → só "Free Agent" no topo
  win.once('ready-to-show', () => win.show());
  win.loadURL(`${ORIGEM}/index.html`);

  // links/abas novas → navegador padrão do sistema (não é um browser em si)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!String(url).startsWith(ORIGEM)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // atalhos sem barra de menu (Ctrl+R/F5 recarrega, F12 devtools, zoom)
  win.webContents.on('before-input-event', (e, inp) => {
    if (inp.type !== 'keyDown') return;
    const k = String(inp.key || '').toLowerCase();
    if ((inp.control && k === 'r') || inp.key === 'F5') { e.preventDefault(); win.webContents.reload(); }
    else if (inp.key === 'F12' || (inp.control && inp.shift && k === 'i')) { e.preventDefault(); win.webContents.toggleDevTools(); }
    else if (inp.control && (k === '+' || k === '=')) { e.preventDefault(); win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5); }
    else if (inp.control && k === '-') { e.preventDefault(); win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5); }
    else if (inp.control && k === '0') { e.preventDefault(); win.webContents.setZoomLevel(0); }
  });

  win.on('closed', () => { win = null; });
}

// uma única instância: segunda abertura só foca a janela (evita porta ocupada)
const trava = app.requestSingleInstanceLock();
if (!trava) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    try {
      await sobeServidor();
    } catch (err) {
      const ocupada = err && err.code === 'EADDRINUSE';
      dialog.showErrorBox(
        'Free Agent',
        ocupada
          ? `A porta ${PORTA} já está em uso.\n\nFeche a outra cópia do Free Agent (ou o serviço na porta ${PORTA}) e abra de novo.`
          : `Não consegui iniciar o servidor local:\n${err && err.message}`
      );
      app.quit();
      return;
    }
    iniciaServidorVoz();
    janela();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) janela(); });
  });

  app.on('window-all-closed', () => {
    encerraServidorVoz();
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', () => {
    encerraServidorVoz();
    if (server) { try { server.close(); } catch {} server = null; }
  });
  process.on('exit', encerraServidorVoz);
}

