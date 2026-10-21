// JavaScript, desktop/browser-policy.js, Node/Electron main; navigation policy.
'use strict';
const net = require('node:net');

function publicAddress(address) {
  const ip = address.toLowerCase().split('%')[0];
  if (net.isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  // Permit global unicast only; deny IPv4 mappings, ULA, link-local,
  // multicast, documentation and transition networks to private IPv4.
  const second = parseInt(ip.split(':')[1] || '0', 16);
  return net.isIP(ip) === 6 && /^[23]/.test(ip) &&
    !(ip.startsWith('2001:') && (second < 0x200 || second === 0xdb8)) &&
    !/^(2002:|3fff:)/.test(ip);
}

function publicUrl(value, websocket = false) {
  try {
    const url = new URL(value);
    if (!(websocket ? ['http:', 'https:', 'ws:', 'wss:'] : ['http:', 'https:']).includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !host.includes(':')) return false;
    return net.isIP(host) ? publicAddress(host) : true;
  } catch { return false; }
}

function navigation(value) {
  const address = require('../js/browser-navigation')(value);
  if (!publicUrl(address)) throw new Error('Somente sites públicos HTTP/HTTPS são permitidos. Endereços locais e protocolos especiais estão bloqueados.');
  return new URL(address).href;
}

function trustedFrame(event, contents, origin) {
  try {
    const url = new URL(event.senderFrame.url);
    return event.sender === contents && event.senderFrame === contents.mainFrame &&
      url.origin === origin && (url.pathname === '/index.html' || url.pathname === '/');
  } catch { return false; }
}
module.exports = { publicAddress, publicUrl, navigation, trustedFrame };
