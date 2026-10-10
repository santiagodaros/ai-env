// GitHub CLI como bus de eventos. Sin shell (los argumentos no se interpretan) y con salida JSON.
// AI_ENV_GH='["node","/ruta/gh-falso.cjs"]' reemplaza el binario (pruebas).
'use strict';
const { spawnSync } = require('child_process');

function bin() {
  if (process.env.AI_ENV_GH) { try { const a = JSON.parse(process.env.AI_ENV_GH); if (Array.isArray(a) && a.length) return a; } catch { /* valor inválido */ } }
  return ['gh'];
}

function gh(args, opts = {}) {
  const [cmd, ...pre] = bin();
  const r = spawnSync(cmd, [...pre, ...args], { encoding: 'utf8', cwd: opts.cwd, input: opts.input, timeout: opts.timeout || 60000, windowsHide: true });
  if (r.error && r.error.code === 'ENOENT') throw new Error('No encuentro el GitHub CLI (gh). Instalalo (winget install GitHub.cli) y corré gh auth login.');
  if (r.status !== 0 && !opts.allowFail) throw new Error(`gh ${args.slice(0, 3).join(' ')} falló: ${(r.stderr || r.stdout || '').trim().slice(0, 400)}`);
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function ghJson(args, opts) {
  const r = gh(args, opts);
  try { return JSON.parse(r.out || 'null'); } catch { throw new Error(`gh ${args.slice(0, 3).join(' ')} no devolvió JSON: ${r.out.slice(0, 200)}`); }
}

// Número de issue enlazado a un PR: "Closes #N" (y variantes) en el cuerpo, o la rama feat/N-..., fix/N-...
function linkedIssue(pr) {
  const m = String(pr.body || '').match(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i);
  if (m) return Number(m[1]);
  const b = String(pr.headRefName || '').match(/^(?:feat|fix)\/(\d+)-/);
  return b ? Number(b[1]) : null;
}

function checksState(pr) {
  const list = pr.statusCheckRollup || [];
  if (!list.length) return 'sin checks';
  const st = list.map((c) => (c.conclusion || c.state || c.status || '').toUpperCase());
  if (st.some((s) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(s))) return 'fallan';
  if (st.some((s) => ['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED', ''].includes(s))) return 'corriendo';
  return 'pasan';
}

module.exports = { gh, ghJson, linkedIssue, checksState };
