// JavaScript, eval/matrix-eval.mjs, Node.js 24; isolated Canvas lifecycle checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/matrix-bg.js', import.meta.url), 'utf8');
function harness({ reduced = false, no_context = false } = {}) {
  const listeners = new Map();
  const frames = new Map();
  const glyphs = [];
  const fills = [];
  const composites = [];
  let next_id = 0;
  const listen = (key, callback) => listeners.set(key, callback);
  const context = {
    font: '', globalAlpha: 1, fillStyle: '',
    measureText: () => ({ width: 10 }), // monospace: all advances equal
    setTransform() {},
    fillText(glyph) { glyphs.push(glyph); },
    clearRect() {},
    fillRect() { fills.push(this.fillStyle); composites.push(this.globalCompositeOperation); }
  };
  const canvas = { style: {}, getContext: () => no_context ? null : context };
  const button = { addEventListener: (_, cb) => listen('pause', cb) };
  const slider = { value: 70, addEventListener: (_, cb) => listen('intensity', cb) };
  const media = { matches: reduced, addEventListener: (_, cb) => listen('motion', cb) };
  const document = {
    hidden: false, body: { classList: { contains: () => false } },
    getElementById: id => ({ bgMatrix: canvas, btnFxToggle: button, fxIntensity: slider,
      chatPane: { getBoundingClientRect: () => ({ top: 40, left: 80, right: 240, bottom: 180 }) }
    })[id],
    addEventListener: (name, cb) => listen(name, cb)
  };
  const scope = {
    MutationObserver: class { constructor(cb) { listen('bodyclass', cb); } observe() {} },
    document, innerWidth: 320, innerHeight: 200, devicePixelRatio: 3,
    console: { info() {}, warn() {} }, performance: { now: () => 0 },
    matchMedia: () => media,
    addEventListener: (name, cb) => listen(name, cb),
    requestAnimationFrame: cb => { frames.set(++next_id, cb); return next_id; },
    cancelAnimationFrame: id => frames.delete(id)
  };
  scope.window = scope;
  vm.runInNewContext(source, scope);
  const tick = time => {
    const pending = [...frames];
    frames.clear();
    for (const [, cb] of pending) cb(time);
  };
  return { scope, canvas, frames, glyphs, fills, composites, context, media, listeners, tick, document };
}

const h = harness();
const engine = h.scope.__matrixBg;
engine.setActive(true);
engine.setScope(true);
assert.equal(h.canvas.style.clipPath, 'inset(40px 80px 20px 80px round 20px)', 'central rain excludes sidebars and header');
engine.setScope(false);
assert.equal(h.canvas.style.clipPath, '', 'full-screen option removes clipping');
assert.equal(h.canvas.width, 640, 'DPR capped at 2');
h.tick(1000 / 60);
assert.ok(h.glyphs.length > 0);
assert.equal(h.composites.at(-1), 'destination-out', 'fade erases alpha instead of covering UI in black');
assert.equal(h.context.globalCompositeOperation, 'source-over', 'glyph drawing restores source-over');
assert.ok(h.glyphs.every(ch => /^[A-Z0-9=+*<>\[\]{}#/\\|:;.,?@$%&_\-]$/.test(ch)), 'ASCII survives identical tofu/monospace advances');
const alpha = Number(h.fills.at(-1).match(/,([^,]+)\)$/)[1]);
assert.ok(Math.abs(alpha - 0.065) < 0.000001);
h.listeners.get('pause')();
assert.equal(h.frames.size, 0, 'pause cancels pending frame');
h.scope.innerWidth = 800;
h.listeners.get('resize')();
const before = h.glyphs.length;
h.tick(30);
assert.equal(h.canvas.width, 1600);
assert.ok(h.glyphs.length > before, 'resize repaints paused composition');
assert.equal(h.frames.size, 0);
h.listeners.get('pause')();
assert.equal(h.frames.size, 1);
h.document.hidden = true;
h.listeners.get('visibilitychange')();
assert.equal(h.frames.size, 0);
h.document.hidden = false;
h.listeners.get('visibilitychange')();
assert.equal(h.frames.size, 1);
h.document.body.classList.contains=()=>true;
const glyphsBeforeBrowser=h.glyphs.length;h.tick(2000);h.tick(2040);
assert.ok(h.frames.size===1&&h.glyphs.length>glyphsBeforeBrowser,'browser keeps selected Matrix moving');
h.document.body.classList.contains=()=>false;
h.listeners.get('resize')();
engine.setActive(false);
assert.equal(h.frames.size, 0, 'deactivation cancels render and resize');
const r = harness({ reduced: true });
r.scope.__matrixBg.setActive(true);
assert.equal(r.frames.size, 0);
assert.ok(r.glyphs.length > 0, 'reduced motion draws static rain');
r.media.matches = false;
r.listeners.get('motion')();
assert.equal(r.frames.size, 1);
const f = harness({ no_context: true });
assert.equal(f.scope.__matrixBg, undefined);
assert.equal(f.canvas.style.display, 'none');
console.log('VERIFIED: Matrix lifecycle, ASCII fallback, timed fade, DPR, resize, pause, visibility, reduced motion, missing context.');
