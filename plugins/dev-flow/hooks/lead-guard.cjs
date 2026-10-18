#!/usr/bin/env node
// PreToolUse (Edit|Write|MultiEdit|NotebookEdit): en modo Tech Lead, la sesión principal no edita código.
// Se activa con {"lead": {"enforce": true}} en .claude/dev-flow.json (lo pone /dev-flow:init en modo Tech Lead).
// - Bloquea editar archivos de código (y sus pruebas) en el checkout principal del repo.
// - Permite docs, PRD, estado, .claude/, .dev-flow/ y cualquier archivo dentro de un worktree (ahí trabajan los
//   workers y los subagentes con isolation: worktree). La regla es por ruta: no depende de quién llama.
// - No aplica a los workers lanzados por dispatch o feature-flow (FEATURE_FLOW_CHILD).
// - El subagente explorer (agent_type en el evento) solo escribe su archivo de hallazgos en .dev-flow/: ver readonly.cjs.
// Limitación conocida: no ve escrituras hechas con Bash (sed -i, >). Las bloquea igual el auditor y las compuertas.
// Apagarlo: AI_ENV_HOOKS_SKIP=lead-guard, o "lead": {"enforce": false}.
const fs = require('fs');
const path = require('path');
const { run, block, projectDir } = require('./lib.cjs');
const config = require('../lib/config.cjs');
const { CODE, NOT_CODE } = require('../skills/feature-close/scripts/gates.cjs');
const { isReadonly, readonlyWriteOk } = require('./readonly.cjs');

const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };

run('lead-guard', (input) => {
  const ti = input.tool_input || {};
  const file = ti.file_path || ti.notebook_path || ti.path;
  const proj = projectDir(input);
  if (isReadonly(input)) {
    // Ruta del archivo (resolviendo la carpeta, que puede no existir todavía) relativa al proyecto o a su repo.
    const abs = file ? path.join(real(path.dirname(path.resolve(proj, file))), path.basename(file)) : '';
    const rels = [real(proj), real(config.repoRoot(proj))].map((b) => path.relative(b, abs).split(path.sep).join('/'));
    if (input.tool_name !== 'Write' || !abs || !rels.some(readonlyWriteOk)) block(`${input.agent_type} es de solo lectura: solo escribe su archivo de hallazgos (.dev-flow/tickets/<N>/<tema>.md), no ${(abs && rels[0]) || input.tool_name}.`, 'readonly-agent-write');
    return;
  }
  if (process.env.FEATURE_FLOW_CHILD) return;
  if (!file) return;
  const root = config.repoRoot(proj);
  const cfg = config.load(root);
  if (!cfg.lead || cfg.lead.enforce !== true) return;
  const abs = real(path.isAbsolute(file) ? file : path.join(proj, file));
  // Un worktree (aunque viva dentro del repo, en .claude/worktrees) es zona de trabajo: se permite.
  let dir = path.dirname(abs);
  while (dir.length > 1 && !fs.existsSync(dir)) dir = path.dirname(dir);
  let top = dir;
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) { top = d; break; }
    if (path.dirname(d) === d) break;
  }
  if (fs.existsSync(path.join(top, '.git')) && fs.statSync(path.join(top, '.git')).isFile()) return; // .git es archivo: es un worktree
  const rr = real(root);
  const inRepo = abs === rr || abs.startsWith(rr + path.sep);
  if (!inRepo) return;
  const rel = path.relative(rr, abs).split(path.sep).join('/');
  if (/^(\.claude|\.dev-flow|docs)\//.test(rel) || !CODE.test(rel) || NOT_CODE.test(rel)) return;
  block(`modo Tech Lead: esta sesión no edita código (${rel}). Lanzá un implementer (/dev-flow:dispatch) o un subagente dev-flow:implementer, que trabaja en su propio worktree. Si es a propósito, apagalo con AI_ENV_HOOKS_SKIP=lead-guard.`, 'lead-edits-code');
});
