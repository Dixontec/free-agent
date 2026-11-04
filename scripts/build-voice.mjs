#!/usr/bin/env node
/* Free Agent · prepara o runtime de voz que vai EMBUTIDO no app.
 *
 * Gera `vendor/voice/` com:
 *   python/            CPython portátil (sem depender do Python da máquina)
 *   py/                site-packages do TTS (kokoro-onnx, onnxruntime, espeak…)
 *   voice_server.py    servidor HTTP local (Kokoro TTS)
 *
 * Os modelos (kokoro-v1.0.onnx + voices-v1.0.bin) NÃO entram aqui: o
 * electron-builder os copia de voice-server/models para resources/voice/models.
 *
 * Uso:
 *   npm run voice:bundle          (gera/atualiza)
 *   npm run voice:bundle -- --force
 *
 * Requer `uv` (https://docs.astral.sh/uv/) no PATH, ou --python <caminho>.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'voice-server');
const OUT = path.join(ROOT, 'vendor', 'voice');
const BUILD_VENV = path.join(SRC, '.build-venv');
const MODELS = path.join(SRC, 'models');
const STAMP = path.join(OUT, '.stamp');
const FORCE = process.argv.includes('--force');
const PY_OVERRIDE = (() => {
  const i = process.argv.indexOf('--python');
  return i >= 0 ? process.argv[i + 1] : process.env.FA_VOICE_PYTHON || '';
})();
const IS_WIN = process.platform === 'win32';
const PY_EXE = IS_WIN ? 'python.exe' : 'python3';
const PY_VER = '3.12';

const log = (...a) => console.log('[voice:bundle]', ...a);
const die = (msg) => { console.error('[voice:bundle] ERRO:', msg); process.exit(1); };
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const bin = (venv) => path.join(venv, IS_WIN ? 'Scripts' : 'bin', PY_EXE);
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });

function which(cmd) {
  try { return execFileSync(IS_WIN ? 'where' : 'which', [cmd], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]; }
  catch { return ''; }
}

function copyTree(from, to, filter) {
  fs.cpSync(from, to, {
    recursive: true,
    dereference: false,
    filter: (src, dest) => {
      const name = path.basename(src);
      if (name === '__pycache__' || name.endsWith('.pyc')) return false;
      return filter ? filter(name, src) : true;
    },
  });
}

function resolvePython() {
  if (PY_OVERRIDE) {
    const p = path.resolve(PY_OVERRIDE);
    if (!exists(p)) die(`--python não encontrado: ${p}`);
    return { exe: p, prefix: IS_WIN ? path.dirname(p) : path.dirname(path.dirname(p)) };
  }
  if (!which('uv')) {
    die('uv não encontrado. Instale (https://docs.astral.sh/uv/) ou passe --python <caminho do python3.12>.');
  }
  log(`uv: garantindo CPython ${PY_VER}…`);
  sh('uv', ['python', 'install', PY_VER]);
  const exe = execFileSync('uv', ['python', 'find', PY_VER], { encoding: 'utf8' }).trim();
  if (!exists(exe)) die(`uv python find ${PY_VER} retornou caminho inexistente: ${exe}`);
  const prefix = IS_WIN ? path.dirname(exe) : path.dirname(path.dirname(exe));
  return { exe, prefix };
}

function ensureModels() {
  const onnx = path.join(MODELS, 'kokoro-v1.0.onnx');
  const voices = path.join(MODELS, 'voices-v1.0.bin');
  for (const [f, min] of [[onnx, 100e6], [voices, 1e6]]) {
    if (!exists(f) || fs.statSync(f).size < min) {
      die(`modelo ausente/ inválido: ${f}\n         Rode: npm run voice:models`);
    }
  }
  return { onnx: fs.statSync(onnx).size, voices: fs.statSync(voices).size };
}

function sitePackages(dir) {
  if (IS_WIN) return path.join(dir, 'Lib', 'site-packages');
  const lib = path.join(dir, 'lib');
  const pyDir = fs.readdirSync(lib).find((d) => /^python\d+\.\d+$/.test(d));
  if (!pyDir) die(`não achei site-packages em ${dir}`);
  return path.join(lib, pyDir, 'site-packages');
}

function main() {
  const models = ensureModels();
  const py = resolvePython();
  log(`CPython base: ${py.prefix}`);

  log('criando venv de build…');
  sh('uv', ['venv', '--clear', BUILD_VENV, '--python', py.exe]);
  log('instalando dependências de TTS…');
  sh('uv', ['pip', 'install', '--python', bin(BUILD_VENV), '-r', path.join(SRC, 'requirements.txt')]);

  log('montando vendor/voice…');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // CPython portátil (sem testes/tk/idle para economizar espaço)
  const skip = new Set(['test', 'tests', 'idlelib', 'tkinter', 'turtledemo', 'lib2to3', 'ensurepip', 'include', 'share', 'site-packages']);
  copyTree(py.prefix, path.join(OUT, 'python'), (name) => !skip.has(name));

  // Dependências Python do TTS
  const sp = sitePackages(BUILD_VENV);
  const skipPy = /^(pip|setuptools|wheel|_distutils_hack|pkg_resources)([-.]|$)/;
  copyTree(sp, path.join(OUT, 'py'), (name) => !skipPy.test(name));

  fs.copyFileSync(path.join(SRC, 'voice_server.py'), path.join(OUT, 'voice_server.py'));

  // Sanidade: o runtime montado precisa importar o Kokoro
  const probe = path.join(OUT, 'python', IS_WIN ? 'python.exe' : path.join('bin', PY_EXE));
  log('validando runtime embutido…');
  try {
    sh(probe, ['-c', 'import kokoro_onnx, onnxruntime, numpy, espeakng_loader; print("ok", onnxruntime.__version__)'], {
      env: { ...process.env, PYTHONPATH: path.join(OUT, 'py'), PYTHONNOUSERSITE: '1' },
    });
  } catch {
    die('o runtime embutido não conseguiu importar kokoro_onnx (veja o erro acima).');
  }

  fs.writeFileSync(STAMP, JSON.stringify({
    createdAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    python: PY_VER,
    models,
  }, null, 2));

  const size = execFileSync(IS_WIN ? 'powershell' : 'du', IS_WIN ? ['-NoProfile', '-Command', `(Get-ChildItem -Recurse '${OUT}' | Measure-Object Length -Sum).Sum`] : ['-sh', OUT], { encoding: 'utf8' }).trim();
  log(`pronto: ${OUT} (${size})`);
}

if (!FORCE && exists(STAMP)) {
  const st = JSON.parse(fs.readFileSync(STAMP, 'utf8'));
  if (st.platform === process.platform && st.arch === process.arch && st.python === PY_VER) {
    log('runtime já montado (use --force para refazer):', OUT);
    process.exit(0);
  }
}
main();
