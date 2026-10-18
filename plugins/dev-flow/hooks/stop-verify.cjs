#!/usr/bin/env node
// Stop: antes de que Claude dé el turno por terminado, si hubo cambios de código: frena restos de depuración en las
// líneas agregadas (debugger, .only, fit, fdescribe) y corre typecheck y lint.
// exit 2 = Claude no puede terminar y recibe el error. Bloquea como máximo una vez por turno (stop_hook_active).
// Usa `npm run <script> --if-present`: si no existe el script, se saltea.
// Para desactivarlo: AI_ENV_HOOKS_SKIP=stop-verify, o {"stopVerify": false} en .claude/dev-flow.json del proyecto.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { run, log, projectDir } = require('./lib.cjs');

run('stop-verify', (input) => {
  if (input.stop_hook_active) process.exit(0); // ya bloqueó una vez en este turno: no entrar en bucle

  const cwd = projectDir(input);
  try { if (JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'dev-flow.json'), 'utf8')).stopVerify === false) process.exit(0); } catch { /* sin config: activo */ }

  // ¿Hubo cambios de código?
  const st = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, encoding: 'utf8' });
  if (st.status !== 0) process.exit(0);
  const changed = st.stdout
    .split('\n')
    .map((l) => l.slice(3).split(' -> ').pop().trim().replace(/^"|"$/g, ''))
    .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));
  if (changed.length === 0) process.exit(0);

  const failures = [];
  // Restos de depuración en lo que se agregó (archivos seguidos: diff contra HEAD; nuevos: el archivo entero).
  // Una línea se excluye con el comentario "stop-verify-allow".
  const DEBUG = [[/(^|[;{}\s])debugger\s*;?\s*($|\/\/)/, 'debugger'], [/\b(it|test|describe|context)\.only\s*\(/, '.only('], [/(^|[^\w.])(fit|fdescribe|xit|xdescribe)\s*\(/, 'fit/fdescribe/xit']];
  const added = [];
  const diff = spawnSync('git', ['diff', 'HEAD', '--unified=0', '--no-color', '--', ...changed], { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  let file = null, ln = 0;
  for (const l of (diff.status === 0 ? diff.stdout : '').split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, ''); continue; }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/); if (h) { ln = Number(h[1]); continue; }
    if (file && l.startsWith('+') && !l.startsWith('+++')) added.push([file, ln++, l.slice(1)]);
  }
  const untracked = st.stdout.split('\n').filter((l) => l.startsWith('?? ')).map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).filter((f) => changed.includes(f));
  for (const f of untracked) { try { fs.readFileSync(path.join(cwd, f), 'utf8').split('\n').forEach((t, i) => added.push([f, i + 1, t])); } catch { /* ilegible */ } }
  // Dentro de un string no cuenta (fixtures de pruebas que escriben "it.only(" a propósito): comillas impares antes del hallazgo.
  const inString = (t, i) => ['\'', '"', '`'].some((q) => (t.slice(0, i).split(q).length - 1) % 2 === 1);
  const debug = added.filter(([, , t]) => !/stop-verify-allow/.test(t)).map(([f, n, t]) => { const hit = DEBUG.find(([re]) => { const m = t.match(re); return m && !inString(t, m.index + m[0].search(/[a-z.]/i)); }); return hit ? `${f}:${n}: ${hit[1]}` : null; }).filter(Boolean);
  if (debug.length) failures.push(`restos de depuración en lo que agregaste (sacalos; si uno es a propósito, marcá la línea con "stop-verify-allow"):\n${debug.slice(0, 10).join('\n')}`);
  if (!fs.existsSync(path.join(cwd, 'package.json')) && !failures.length) process.exit(0);

  for (const script of fs.existsSync(path.join(cwd, 'package.json')) ? ['typecheck', 'lint'] : []) {
    const r = spawnSync('npm', ['run', script, '--if-present', '--silent'], {
      cwd,
      encoding: 'utf8',
      shell: true, // necesario en Windows (npm.cmd)
      env: { ...process.env, CI: '1' }, // nada en modo watch: un hook no puede quedarse esperando
      timeout: 120000,
    });
    if (r.status !== 0) {
      const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-40).join('\n');
      failures.push(`npm run ${script} falló:\n${out}`);
    }
  }

  if (failures.length > 0) {
    log('stop-verify', 'block', 'verify-failed');
    process.stderr.write(
      `No des el trabajo por terminado: la verificación automática falló.\n\n${failures.join('\n\n')}\n`
    );
    process.exit(2);
  }
  process.exit(0);
});
