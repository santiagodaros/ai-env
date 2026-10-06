#!/usr/bin/env node
// Stop: antes de que Claude dé el turno por terminado, corre typecheck y lint si hubo cambios de código.
// exit 2 = Claude no puede terminar y recibe el error. Bloquea como máximo una vez por turno (stop_hook_active).
// Usa `npm run <script> --if-present`: si no existe el script, se saltea.
// Para desactivarlo: AI_ENV_HOOKS_SKIP=stop-verify, o {"stopVerify": false} en .claude/dev-flow.json del proyecto.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (require('./lib.cjs').off('stop-verify')) process.exit(0);
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (input.stop_hook_active) process.exit(0); // ya bloqueó una vez en este turno: no entrar en bucle

  const cwd = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  if (!fs.existsSync(path.join(cwd, 'package.json'))) process.exit(0);
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
  for (const script of ['typecheck', 'lint']) {
    const r = spawnSync('npm', ['run', script, '--if-present', '--silent'], {
      cwd,
      encoding: 'utf8',
      shell: true, // necesario en Windows (npm.cmd)
      timeout: 120000,
    });
    if (r.status !== 0) {
      const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-40).join('\n');
      failures.push(`npm run ${script} falló:\n${out}`);
    }
  }

  if (failures.length > 0) {
    process.stderr.write(
      `No des el trabajo por terminado: la verificación automática falló.\n\n${failures.join('\n\n')}\n`
    );
    process.exit(2);
  }
  process.exit(0);
});
