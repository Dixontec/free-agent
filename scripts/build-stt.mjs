#!/usr/bin/env node
/* Free Agent · prepara o STT (Whisper) que vai EMBUTIDO no app.
 *
 * Gera `vendor/stt/` com:
 *   lib/     transformers.js + wasm do onnxruntime (roda 100% local)
 *   models/  Xenova/whisper-base e whisper-tiny (ONNX quantizado)
 *
 * O app serve esses arquivos no próprio origin: `/vendor/stt/lib/*` e `/models/*`.
 * Sem isso o navegador baixa ~100 MB do Hugging Face na primeira transcrição.
 *
 * Uso:
 *   npm run stt:bundle          (gera/atualiza)
 *   npm run stt:bundle -- --force
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'vendor', 'stt');
const STAMP = path.join(OUT, '.stamp');
const FORCE = process.argv.includes('--force');
const require = createRequire(import.meta.url);

const COMMON = [
  { name: 'config.json', min: 200 },
  { name: 'generation_config.json', min: 100 },
  { name: 'preprocessor_config.json', min: 200 },
  { name: 'tokenizer.json', min: 500000 },
  { name: 'tokenizer_config.json', min: 100 },
  { name: 'onnx/encoder_model_quantized.onnx', min: 5e6 },
  { name: 'onnx/decoder_model_merged_quantized.onnx', min: 10e6 },
];
const MODELS = [
  { repo: 'Xenova/whisper-base', files: COMMON },
  { repo: 'Xenova/whisper-tiny', files: COMMON },
];

const log = (...a) => console.log('[stt:bundle]', ...a);
const die = (m) => { console.error('[stt:bundle] ERRO:', m); process.exit(1); };
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

function download(url, dest, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 8) return reject(new Error('muitos redirecionamentos'));
    const mod = url.startsWith('https:') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'free-agent-build' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return download(new URL(res.headers.location, url).href, dest, hops + 1);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0, last = 0;
      const tmp = dest + '.downloading';
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const out = fs.createWriteStream(tmp);
      res.on('data', (c) => {
        got += c.length;
        if (Date.now() - last > 700) {
          last = Date.now();
          const pct = total ? Math.round((got / total) * 100) : 0;
          process.stdout.write(`\r  ${path.basename(dest)} ${pct}% (${(got / 1048576).toFixed(0)} MB)`);
        }
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => { fs.renameSync(tmp, dest); process.stdout.write('\n'); resolve(); }));
      out.on('error', (e) => { try { fs.unlinkSync(tmp); } catch {} reject(e); });
    }).on('error', reject);
  });
}

async function main() {
  const pkgDir = path.dirname(require.resolve('@xenova/transformers/package.json'));
  const dist = path.join(pkgDir, 'dist');
  if (!exists(dist)) die('@xenova/transformers não instalado (npm i -D @xenova/transformers).');

  if (!FORCE && exists(STAMP)) {
    const st = JSON.parse(fs.readFileSync(STAMP, 'utf8'));
    if (st.version === require('@xenova/transformers/package.json').version) {
      log('já montado (use --force para refazer):', OUT);
      return;
    }
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  const lib = path.join(OUT, 'lib');
  fs.mkdirSync(lib, { recursive: true });
  for (const f of ['transformers.min.js', 'ort-wasm.wasm', 'ort-wasm-threaded.wasm', 'ort-wasm-simd.wasm', 'ort-wasm-simd-threaded.wasm']) {
    const src = path.join(dist, f);
    if (!exists(src)) die(`arquivo ausente no pacote transformers: ${f}`);
    fs.copyFileSync(src, path.join(lib, f));
  }
  log('runtime transformers.js copiado');

  for (const m of MODELS) {
    for (const f of m.files) {
      const dest = path.join(OUT, 'models', m.repo, f.name);
      if (exists(dest) && fs.statSync(dest).size >= f.min) continue;
      const url = `https://huggingface.co/${m.repo}/resolve/main/${f.name}`;
      log(`baixando ${m.repo}/${f.name}…`);
      await download(url, dest);
      if (fs.statSync(dest).size < f.min) die(`arquivo pequeno demais: ${dest}`);
    }
  }

  fs.writeFileSync(STAMP, JSON.stringify({
    createdAt: new Date().toISOString(),
    version: require('@xenova/transformers/package.json').version,
  }, null, 2));
  log('pronto:', OUT);
}

main().catch((e) => die(e.message || String(e)));
