#!/usr/bin/env node
// ¿Las pruebas detectan el cambio? Saca temporalmente el cambio de código de la rama (deja las pruebas nuevas),
// corre las pruebas y las vuelve a dejar como estaban. Si pasan igual sin el cambio, son complacientes.
// Uso: node test-honesty.cjs [--base main] [--test "npm test"] [--timeout 600] [--json]
// Requisito: los archivos de código cambiados tienen que estar commiteados y sin cambios locales (se restauran desde HEAD).
// Resultado: PASA (fallan sin el cambio), FALLA (pasan sin el cambio), NO-APLICA (sin cambios de código o sin pruebas), ERROR.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { CODE, NOT_CODE, TEST } = require('../../feature-close/scripts/gates.cjs');
const config = require('../../../lib/config.cjs');

function testCommand(root, cfg, forced) {
  if (forced) return forced;
  if (cfg.testCommand) return cfg.testCommand;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg.scripts && pkg.scripts.test && !/no test specified/.test(pkg.scripts.test)) {
      const pm = fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(root, 'yarn.lock')) ? 'yarn' : 'npm';
      return `${pm} test`;
    }
  } catch { /* sin package.json */ }
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'pytest.ini'))) return 'python -m pytest -q';
  return null;
}

function run({ root, base = 'main', test, timeout = 600 }) {
  const git = (a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' });
  const cfg = config.load(root);
  const cmd = testCommand(root, cfg, test);
  const res = { result: 'ERROR', base, command: cmd, code: [], tests: [], detail: '' };
  const mb = git(['merge-base', base, 'HEAD']);
  if (mb.status !== 0) { res.detail = `no pude calcular la base contra ${base}`; return res; }
  const baseSha = mb.stdout.trim();
  const changed = git(['diff', '--name-status', `${baseSha}...HEAD`]).stdout.split('\n').filter(Boolean).map((l) => l.split('\t'));
  const live = changed.filter((p) => !p[0].startsWith('D'));
  res.code = live.map((p) => p[p.length - 1]).filter((f) => CODE.test(f) && !NOT_CODE.test(f) && !TEST.test(f));
  res.tests = live.map((p) => p[p.length - 1]).filter((f) => TEST.test(f));
  if (!res.code.length) { res.result = 'NO-APLICA'; res.detail = 'la rama no cambia código que requiera pruebas'; return res; }
  if (!cmd) { res.result = 'NO-APLICA'; res.detail = 'no hay comando de pruebas (testCommand en .claude/dev-flow.json o script "test")'; return res; }
  const dirty = git(['status', '--porcelain', '--', ...res.code]).stdout.trim();
  if (dirty) { res.detail = `hay cambios sin commitear en archivos de código: commiteá antes (${dirty.split('\n')[0]})`; return res; }
  const runTests = () => spawnSync(cmd, { cwd: root, encoding: 'utf8', shell: true, timeout: timeout * 1000, env: { ...process.env, CI: '1' } });

  const withChange = runTests();
  if (withChange.status !== 0) { res.result = 'ERROR'; res.detail = `las pruebas fallan CON el cambio (código ${withChange.status}): no hay nada que medir. ${tail(withChange)}`; return res; }

  // Sacar el cambio: los archivos que existían en la base vuelven a la base; los nuevos se apartan.
  const existedInBase = (f) => git(['cat-file', '-e', `${baseSha}:${f}`]).status === 0;
  const added = res.code.filter((f) => !existedInBase(f));
  const modified = res.code.filter((f) => !added.includes(f));
  const restore = () => {
    if (modified.length) git(['checkout', 'HEAD', '--', ...modified]);
    for (const f of added) { const p = path.join(root, f); if (fs.existsSync(p + '.honesty-bak')) fs.renameSync(p + '.honesty-bak', p); }
  };
  const onSignal = () => { restore(); process.exit(130); };
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  let without;
  try {
    if (modified.length) { const c = git(['checkout', baseSha, '--', ...modified]); if (c.status !== 0) throw new Error(c.stderr); }
    for (const f of added) { const p = path.join(root, f); if (fs.existsSync(p)) fs.renameSync(p, p + '.honesty-bak'); }
    without = runTests();
  } finally {
    restore();
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
  }
  const clean = !git(['status', '--porcelain', '--', ...res.code]).stdout.trim();
  if (!clean) { res.result = 'ERROR'; res.detail = 'no pude dejar los archivos como estaban: revisá git status'; return res; }
  if (without.status === 0) { res.result = 'FALLA'; res.detail = `las pruebas pasan igual sin el cambio en ${res.code.length} archivo(s): no lo cubren${res.tests.length ? '' : ' (y la rama no toca ninguna prueba)'}`; }
  else { res.result = 'PASA'; res.detail = `sin el cambio las pruebas fallan (código ${without.status}): lo cubren`; }
  return res;
}
const tail = (r) => `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-3).join(' | ').slice(0, 300);

if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const r = run({ root: config.repoRoot(process.cwd()), base: get('--base') || 'main', test: get('--test'), timeout: Number(get('--timeout') || 600) });
  if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else console.log(`Honestidad de las pruebas: ${r.result} — ${r.detail}${r.command ? `\n  Comando: ${r.command}` : ''}${r.code.length ? `\n  Código cambiado: ${r.code.join(', ')}` : ''}`);
  process.exit(r.result === 'FALLA' ? 1 : r.result === 'ERROR' ? 2 : 0);
}
module.exports = { run, testCommand };
