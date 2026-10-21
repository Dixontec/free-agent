// JavaScript, desktop/browser-preload.js, Electron sandbox; app frame only.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const commands = new Set(['state', 'create', 'activate', 'close', 'navigate', 'back', 'forward', 'reload', 'stop', 'layout', 'external', 'normalize', 'permission-set', 'permission-answer', 'extension-load', 'extension-set', 'extension-remove', 'blocker-set', 'blocker-update', 'fullscreen', 'selection', 'observe', 'agent-action', 'agent-navigate', 'capture', 'ai-stop']);
contextBridge.exposeInMainWorld('freeAgentBrowser', Object.freeze({
  invoke(command, payload = {}) {
    if (!commands.has(command)) return Promise.reject(new Error('Comando inválido.'));
    return ipcRenderer.invoke('fa-browser:command', command, payload);
  },
  onState(callback) {
    if (typeof callback !== 'function') throw new TypeError('Callback inválido.');
    const listener = (_, state) => callback(state);
    ipcRenderer.on('fa-browser:state', listener);
    return () => ipcRenderer.removeListener('fa-browser:state', listener);
  }
}));
