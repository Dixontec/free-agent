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
const { createStaticServer } = require('./server');
const { createBrowserManager } = require('./browser-manager');

const PORTA = Number(process.env.FA_APP_PORT || 47811); // stable production origin; configurable development port
if (!Number.isInteger(PORTA) || PORTA < 1024 || PORTA > 65535) throw Error('FA_APP_PORT inválida.');
if (process.env.FA_DEV_PROFILE) app.setPath('userData', path.resolve(process.env.FA_DEV_PROFILE));
const RAIZ = path.join(__dirname, '..');
const ORIGEM = `http://127.0.0.1:${PORTA}`;

let win = null;
let server = null;

function sobeServidor() {
  return new Promise((resolve, reject) => {
    server = createStaticServer(RAIZ, { liveReload: process.env.FA_DEV === '1' });
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
      // A fullscreen WebContentsView covers this renderer. Keep its layout and
      // IPC alive rather than treating native-child occlusion as a hidden app.
      backgroundThrottling: false,
      preload: path.join(__dirname, 'browser-preload.js'),
    },
  });

  Menu.setApplicationMenu(null); // sem menu → só "Free Agent" no topo
  const browser = createBrowserManager(win, ORIGEM, app.getPath('userData'));
  win.on('close', () => browser.dispose());
  win.once('ready-to-show', () => win.show());
  win.loadURL(`${ORIGEM}/index.html`);

  // links/abas novas → navegador padrão do sistema (não é um browser em si)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== ORIGEM) {
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
    janela();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) janela(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => {
    if (server) { try { server.close(); } catch {} server = null; }
  });
}
