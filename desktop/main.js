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

const VOZ_PORTA = 8880;           // voice-server local (Kokoro TTS)
const IS_WIN = process.platform === 'win32';

let win = null;
let server = null;
let voiceProcess = null;

/* Runtime de voz:
   - empacotado → resources/voice (CPython portátil + site-packages + modelos)
   - dev        → vendor/voice (gerado por `npm run voice:bundle`) ou venv do repo */
function runtimeDeVoz() {
  const modelosRepo = path.join(RAIZ, 'voice-server', 'models');
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'voice') : path.join(RAIZ, 'vendor', 'voice');
  const py = path.join(dir, 'python', IS_WIN ? 'python.exe' : path.join('bin', 'python3'));
  const script = path.join(dir, 'voice_server.py');
  const site = path.join(dir, 'py');
  if (fs.existsSync(py) && fs.existsSync(script) && fs.existsSync(site)) {
    return {
      bundled: true,
      py,
      script,
      site,
      models: app.isPackaged ? path.join(dir, 'models') : modelosRepo,
      args: ['--no-stt'],
    };
  }
  return {
    bundled: false,
    py: resolvePythonBinary(),
    script: path.join(RAIZ, 'voice-server', 'voice_server.py'),
    site: '',
    models: modelosRepo,
    args: [],
  };
}

function resolvePythonBinary() {
  const candidates = [
    IS_WIN ? path.join(RAIZ, 'voice-server', '.venv', 'Scripts', 'python.exe') : path.join(RAIZ, 'voice-server', '.venv', 'bin', 'python'),
    IS_WIN ? path.join(RAIZ, '.venv', 'Scripts', 'python.exe') : path.join(RAIZ, '.venv', 'bin', 'python'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return IS_WIN ? 'python' : 'python3';
}

function vozJaRodando() {
  return new Promise((resolve) => {
    const s = require('net').connect(VOZ_PORTA, '127.0.0.1');
    s.setTimeout(400);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
}

let voiceStartPromise = null;

function iniciaServidorVoz() {
  if (voiceProcess) return Promise.resolve();
  if (!voiceStartPromise) {
    voiceStartPromise = iniciarVozUnica().finally(() => { voiceStartPromise = null; });
  }
  return voiceStartPromise;
}

async function iniciarVozUnica() {
  if (await vozJaRodando()) {
    console.log('[voice-server] já há um servidor de voz em 127.0.0.1:' + VOZ_PORTA);
    return;
  }

  const rt = runtimeDeVoz();
  if (!fs.existsSync(rt.script)) return;
  const onnx = path.join(rt.models, 'kokoro-v1.0.onnx');
  const voices = path.join(rt.models, 'voices-v1.0.bin');
  if (!fs.existsSync(onnx) || !fs.existsSync(voices)) {
    console.warn('[voice-server] modelos Kokoro ausentes em', rt.models);
    return;
  }

  let logFd = 'ignore';
  try {
    const logPath = path.join(app.getPath('userData'), 'voice-server.log');
    logFd = fs.openSync(logPath, 'a');
  } catch {}

  const env = {
    ...process.env,
    KOKORO_ONNX: onnx,
    KOKORO_VOICES: voices,
    KOKORO_LANG: process.env.KOKORO_LANG || 'pt-br',
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
  };
  if (rt.site) env.PYTHONPATH = rt.site;

  try {
    voiceProcess = spawn(rt.py, [rt.script, '--port', String(VOZ_PORTA), ...rt.args], {
      cwd: path.dirname(rt.script),
      detached: false,
      stdio: ['ignore', logFd, logFd],
      env,
    });

    voiceProcess.on('error', (err) => {
      console.warn('[voice-server] Falha ao iniciar processo de voz:', err.message);
      voiceProcess = null;
    });

    voiceProcess.on('exit', (code) => {
      if (code) console.warn('[voice-server] encerrou com código', code);
      voiceProcess = null;
    });
  } catch (err) {
    console.warn('[voice-server] Erro ao spawnar servidor de voz:', err.message);
  } finally {
    if (typeof logFd === 'number') { try { fs.closeSync(logFd); } catch {} }
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
    const rt = runtimeDeVoz();
    server = createStaticServer(RAIZ, {
      onKokoroDownloaded: iniciaServidorVoz,
      modelsDir: rt.models,
      bundled: rt.bundled,
    });
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

