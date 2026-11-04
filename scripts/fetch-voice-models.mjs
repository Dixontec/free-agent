#!/usr/bin/env node
/* Free Agent · baixa UMA vez os modelos do Kokoro para voice-server/models.
 * Necessário apenas para build/desenvolvimento — o app empacotado já os leva embutidos.
 * Uso: npm run voice:models
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'voice-server', 'models');
const BASE = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0';
const FILES = [
  { name: 'voices-v1.0.bin', min: 1e6 },
  { name: 'kokoro-v1.0.onnx', min: 100e6 },
];

function download(url, dest, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 8) return reject(new Error('muitos redirecionamentos'));
    const mod = url.startsWith('https:') ? https : http;
    mod.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return download(new URL(res.headers.location, url).href, dest, hops + 1);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0, last = 0;
      const tmp = dest + '.downloading';
      const out = fs.createWriteStream(tmp);
      res.on('data', (c) => {
        got += c.length;
        if (Date.now() - last > 500) {
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

fs.mkdirSync(DIR, { recursive: true });
for (const f of FILES) {
  const dest = path.join(DIR, f.name);
  if (fs.existsSync(dest) && fs.statSync(dest).size >= f.min) {
    console.log(`[voice:models] já existe: ${f.name}`);
    continue;
  }
  console.log(`[voice:models] baixando ${f.name}…`);
  await download(`${BASE}/${f.name}`, dest);
}
console.log('[voice:models] pronto em', DIR);
