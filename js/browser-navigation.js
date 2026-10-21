/* One address/search resolver for the renderer and both Electron engines. */
(function (root, factory) {
  const resolve = factory();
  if (typeof module === 'object' && module.exports) module.exports = resolve;
  else root.FreeAgentNavigation = resolve;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  return function navigation(value) {
    if (typeof value !== 'string' || value.length > 4096 || !value.trim()) throw Error('Informe uma URL ou pesquisa.');
    const text = value.trim();
    const host = !/\s/.test(text) && /^(?:[\w-]+\.)+[\w-]+(?::\d+)?(?:[/?#]|$)/.test(text);
    const scheme = /^[a-z][a-z\d+.-]*:/i.test(text);
    const url = new URL(host ? 'https://' + text : scheme ? text : 'https://www.google.com/search?q=' + encodeURIComponent(text));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Use um endereço HTTP/HTTPS sem credenciais.');
    return url.href;
  };
});
