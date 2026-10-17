/* ═══════════ Free Agent · Núcleo Neural 2D (Three.js) ═══════════
   Hub central + nós de Skills (azul) + nós de Memórias (rosa).
   Pulsos percorrem as arestas quando cada área é usada.
*/
import * as THREE from 'three';

let renderer = null, scene = null, camera = null, group = null;
let nogl = false;
let hub = null, hubRing = null, edgeLines = null;
let nodes = [], pulses = [], inited = false, busyGlow = 0, lastAmbient = 0;

const SKILL_COLOR = 0x42a5ff, MEM_COLOR = 0xff2fb3;
const el = id => document.getElementById(id);

function init(canvas) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch { nogl = true; renderer = null; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 9.6);
  group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const pl = new THREE.PointLight(0x66aaff, 40, 50);
  pl.position.set(0, 4, 7);
  scene.add(pl);
  hub = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7788ff, emissiveIntensity: 0.7, roughness: 0.3 })
  );
  group.add(hub);
  hubRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.64, 0.015, 8, 90),
    new THREE.MeshBasicMaterial({ color: 0x42a5ff, transparent: true, opacity: 0.7 })
  );
  group.add(hubRing);
  addEventListener('resize', resize);
  resize();
  requestAnimationFrame(tick);
}

function resize() {
  const canvas = el('neuralCanvas');
  if (!canvas || !renderer) return;
  const w = canvas.clientWidth || 600, h = 300;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function clearNet() {
  nodes.forEach(n => { group.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh.material.dispose(); });
  nodes = [];
  pulses.forEach(p => { group.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
  pulses = [];
  if (edgeLines) { group.remove(edgeLines); edgeLines.geometry.dispose(); edgeLines.material.dispose(); edgeLines = null; }
}

function addNode(kind, id, label, pos, color) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 16, 16),
    new THREE.MeshBasicMaterial({ color })
  );
  mesh.position.copy(pos);
  group.add(mesh);
  nodes.push({ kind, id, label, mesh, base: new THREE.Color(color), flash: 0, seed: Math.random() * 10 });
}

function rebuild() {
  clearNet();
  let skills = [], mems = [];
  try { skills = (getSkills() || []).filter(s => s.active).slice(0, 10); } catch {}
  try { mems = (getConvs() || []).filter(c => c.messages && c.messages.length).slice(0, 8); } catch {}
  skills.forEach((s, i) => {
    const a = Math.PI * (0.5 + (i + 1) / (skills.length + 1));
    addNode('skill', s.slug, s.title, new THREE.Vector3(Math.cos(a) * 4.4, Math.sin(a) * 2.3, ((i * 37 % 10) / 10 - 0.5) * 1.4), SKILL_COLOR);
  });
  mems.forEach((c, i) => {
    const a = Math.PI * (0.5 + (i + 1) / (mems.length + 1));
    addNode('memory', c.id, c.title, new THREE.Vector3(-Math.cos(a) * 4.4, Math.sin(a) * 2.3, ((i * 53 % 10) / 10 - 0.5) * 1.4), MEM_COLOR);
  });
  if (nodes.length) {
    const pts = [];
    nodes.forEach(n => pts.push(0, 0, 0, n.mesh.position.x, n.mesh.position.y, n.mesh.position.z));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    edgeLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2a3a5f, transparent: true, opacity: 0.85 }));
    group.add(edgeLines);
  }
  const d = el('coreDetail');
  if (d) d.textContent = `Rede neural: ${skills.length} skills · ${mems.length} memórias — os pulsos mostram o uso em tempo real.`;
  resize();
}

function spawnPulse(node) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
  );
  mesh.position.set(0, 0, 0);
  group.add(mesh);
  pulses.push({ mesh, target: node.mesh.position.clone(), node, t: 0 });
}

function tick(now) {
  requestAnimationFrame(tick);
  if (!window.__neuralOn || !renderer) return;
  const t = now / 1000;
  group.rotation.y = Math.sin(t * 0.12) * 0.22;
  group.rotation.x = Math.sin(t * 0.09) * 0.08;
  hubRing.rotation.z = t * 0.7;
  hubRing.rotation.x = Math.PI / 2 + Math.sin(t * 0.4) * 0.25;
  const hs = 1 + busyGlow * 0.18 + Math.sin(t * 2.4) * 0.04;
  hub.scale.setScalar(hs);
  hub.material.emissiveIntensity = 0.7 + busyGlow * 1.2;
  nodes.forEach(n => {
    n.mesh.position.y += Math.sin(t * 1.2 + n.seed) * 0.0009;
    if (n.flash > 0) {
      n.flash = Math.max(0, n.flash - 0.03);
      n.mesh.material.color.copy(n.base).lerp(new THREE.Color(0xffffff), n.flash);
      n.mesh.scale.setScalar(1 + n.flash * 1.1);
    }
  });
  pulses = pulses.filter(p => {
    p.t += 0.022;
    if (p.t >= 1) {
      p.node.flash = 1;
      group.remove(p.mesh);
      p.mesh.geometry.dispose(); p.mesh.material.dispose();
      return false;
    }
    p.mesh.position.lerpVectors(new THREE.Vector3(0, 0, 0), p.target, p.t);
    return true;
  });
  if (now - lastAmbient > 2400 && nodes.length) {
    lastAmbient = now;
    spawnPulse(nodes[Math.floor(Math.random() * nodes.length)]);
  }
  renderer.render(scene, camera);
}

window.__neuralBuild = function () {
  const canvas = el('neuralCanvas');
  if (!canvas) return;
  if (!inited) { init(canvas); inited = true; }
  if (nogl || !renderer) return; // sem WebGL: núcleo visual desativado, resto funciona
  window.__neuralOn = true;
  rebuild();
};
window.__neuralFire = function (kind, id) {
  if (!inited || !window.__neuralOn) return;
  const n = nodes.find(n => n.kind === kind && n.id === id);
  const target = n || nodes.find(n => n.kind === kind);
  if (target) spawnPulse(target);
};
window.__neuralSet = function (on) { busyGlow = on ? 1 : 0; };
