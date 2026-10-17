/* ═══════════ Free Agent · Fundo 3D Three.js (partículas + ondas) ═══════════ */
import * as THREE from 'three';

const canvas = document.getElementById('bg3d');
/* Sem WebGL (VM/headless/GPU bloqueada): desliga o 3D em silêncio, fica o aurora */
let renderer = null;
try {
  // Probe primeiro: se não há contexto WebGL, nem tenta (evita o spam de erro do three.js)
  const probe = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!probe) throw new Error('no-webgl');
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
} catch {
  if (canvas) canvas.style.display = 'none';
  window.__bg3dEnabled = false;
}
if (renderer) {

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070814, 0.035);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
camera.position.set(0, 1.5, 14);

scene.add(new THREE.AmbientLight(0x8899ff, 0.7));
const key = new THREE.DirectionalLight(0x66aaff, 1.4); key.position.set(5, 8, 6); scene.add(key);
const rim = new THREE.PointLight(0xff2fb3, 60, 60); rim.position.set(-8, -3, 2); scene.add(rim);
const rim2 = new THREE.PointLight(0x7d2aff, 80, 70); rim2.position.set(8, 4, -4); scene.add(rim2);

/* Núcleo icosaédrico wireframe */
const core = new THREE.Mesh(
  new THREE.IcosahedronGeometry(2.6, 2),
  new THREE.MeshStandardMaterial({ color: 0x2a3cff, wireframe: true, transparent: true, opacity: 0.35, emissive: 0x1133ff, emissiveIntensity: 0.6 })
);
scene.add(core);
const coreSolid = new THREE.Mesh(
  new THREE.IcosahedronGeometry(2.55, 3),
  new THREE.MeshStandardMaterial({ color: 0x0a1030, transparent: true, opacity: 0.55, roughness: 0.25, metalness: 0.9 })
);
scene.add(coreSolid);

/* Anéis orbitais estilo Apple */
const rings = [];
[[4.2, 0x0071e3, 0.5], [5.4, 0x7d2aff, 0.35], [6.6, 0xff2fb3, 0.22]].forEach(([r, c, op], i) => {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.02, 8, 160),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op })
  );
  m.rotation.x = Math.PI / 2 + (i - 1) * 0.28;
  scene.add(m); rings.push(m);
});

/* Partículas */
const N = 900;
const pos = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  const r = 7 + Math.random() * 16;
  const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
  pos[i*3] = r * Math.sin(p) * Math.cos(t);
  pos[i*3+1] = r * Math.sin(p) * Math.sin(t) * 0.6;
  pos[i*3+2] = r * Math.cos(p);
}
const pgeo = new THREE.BufferGeometry();
pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const pmat = new THREE.PointsMaterial({ color: 0x9db8ff, size: 0.06, transparent: true, opacity: 0.8, sizeAttenuation: true });
const stars = new THREE.Points(pgeo, pmat);
scene.add(stars);

let intensity = 0.7, running = true, t = 0;
document.getElementById('fxIntensity')?.addEventListener('input', e => intensity = e.target.value / 100);
document.getElementById('btnFxToggle')?.addEventListener('click', e => {
  running = !running;
  const btn = e.currentTarget;
  btn.innerHTML = running
    ? '<i data-lucide="pause"></i>Pausar fundo'
    : '<i data-lucide="play"></i>Retomar fundo';
  try { if (window.lucide) lucide.createIcons(); } catch {}
});

addEventListener('pointermove', e => {
  const x = (e.clientX / innerWidth - 0.5), y = (e.clientY / innerHeight - 0.5);
  camera.position.x += (x * 3 - camera.position.x) * 0.03;
  camera.position.y += (-y * 2 + 1.5 - camera.position.y) * 0.03;
  camera.lookAt(0, 0, 0);
});

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const theme = document.documentElement.dataset.theme;
  scene.background = theme === 'light' ? new THREE.Color(0xf5f5f7) : null;
  core.visible = coreSolid.visible = theme !== 'light' || true;
  pmat.opacity = theme === 'light' ? 0.35 : 0.8;
}
addEventListener('resize', resize); resize();
new MutationObserver(resize).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

(function loop() {
  requestAnimationFrame(loop);
  if (!running || window.__bg3dEnabled === false) return;
  t += 0.004 * (0.3 + intensity);
  core.rotation.y = t * 2; core.rotation.x = t;
  coreSolid.rotation.y = -t * 1.2;
  rings.forEach((r, i) => r.rotation.z = t * (i % 2 ? -1 : 1) * (0.6 + i * 0.3));
  stars.rotation.y = t * 0.35;
  const s = 1 + Math.sin(t * 8) * 0.02 * intensity;
  core.scale.setScalar(s); coreSolid.scale.setScalar(s);
  renderer.render(scene, camera);
})();
} // ← fim do bloco com-WebGL
