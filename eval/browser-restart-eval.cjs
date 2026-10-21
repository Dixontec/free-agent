// JavaScript, eval/browser-restart-eval.cjs, Node; two real Electron processes.
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const electron = require('electron');
const test = path.join(__dirname, 'browser-electron-eval.cjs');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.FA_BROWSER_LIVE;
function run(args) {
  const result = spawnSync(electron, [test, ...args], { env, encoding: 'utf8', timeout: 70000 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  assert.equal(result.status, 0, result.error?.message || 'Electron test failed');
  return result.stdout;
}
const first = run([]);
const report = JSON.parse(first.match(/VERIFIED: (\{[^\r\n]+\})/)[1]);
assert.ok(report.data);
const second = run(['--restore-data=' + report.data]);
assert.match(second, /VERIFIED-RESTART:/);
console.log('VERIFIED: independent Electron process restart preserves native browser session.');
