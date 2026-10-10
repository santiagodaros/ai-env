#!/usr/bin/env node
// ai-env: pre-commit nativo de git. Lo instala /dev-flow:init (paso git-hook) y vive fuera del plugin
// (~/.claude/ai-env/git-hooks/), porque la ruta del plugin cambia con cada versión; init o setup lo actualizan.
// Corre cuando alguien commitea fuera de Claude Code:
//   - secscan sobre el índice: bloquea los hallazgos de severidad alta (credenciales, TLS apagado, ejecución
//     dinámica); los medios solo se informan.
//   - si el repo tiene architecture.json: arch-check (regla de dependencia entre capas).
// Es una red de seguridad: `git commit --no-verify` lo saltea. El control obligatorio es el CI.
// Apagarlo una vez: AI_ENV_GIT_HOOK=off git commit ...
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

if (/^(off|0|false|no)$/i.test(process.env.AI_ENV_GIT_HOOK || '')) process.exit(0);
const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
if (top.status !== 0) process.exit(0);
const root = top.stdout.trim();
const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' }).stdout.trim();
if (!staged) process.exit(0);

const problems = [];
const notes = [];
const node = (script, args) => spawnSync(process.execPath, [path.join(__dirname, script), ...args], { cwd: root, encoding: 'utf8', timeout: 60000 });

const sec = node('secscan.cjs', ['--range', '--cached', '--json']);
try {
  const j = JSON.parse(sec.stdout || '{}');
  for (const f of j.high || []) problems.push(`seguridad ${f.id} ${f.file}:${f.line} ${f.msg}`);
  for (const f of (j.medium || []).slice(0, 5)) notes.push(`seguridad (media) ${f.id} ${f.file}:${f.line} ${f.msg}`);
} catch { notes.push('secscan no devolvió un resultado legible: no se verificó la seguridad'); }

if (fs.existsSync(path.join(root, 'architecture.json'))) {
  const ac = node('arch-check.cjs', ['--json']);
  try {
    const j = JSON.parse(ac.stdout || '{}');
    for (const v of (j.violations || []).slice(0, 10)) problems.push(`arquitectura ${v.file}${v.line ? ':' + v.line : ''}: ${v.msg}`);
  } catch { problems.push(`architecture.json no se pudo verificar: ${(ac.stderr || ac.stdout || '').trim().split('\n').slice(-1)[0] || 'salida ilegible'}`); }
}

if (notes.length) process.stderr.write(`ai-env pre-commit:\n${notes.map((n) => `  - ${n}`).join('\n')}\n`);
if (problems.length) {
  process.stderr.write(`ai-env pre-commit: commit frenado.\n${problems.map((p) => `  - ${p}`).join('\n')}\nCorregí lo marcado. Si es un falso positivo de secscan, marcá la línea con el comentario "secscan-allow".\n`);
  process.exit(1);
}
process.exit(0);
