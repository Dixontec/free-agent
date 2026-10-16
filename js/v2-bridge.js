/* My OS Harness v2 — bridge: expõe runReAct p/ app.js clássico */
import { runReAct } from './harness-core.js';
window.__runReAct = runReAct;
window.__v2ready = true;
console.info('[myos-v2] bridge pronto');
