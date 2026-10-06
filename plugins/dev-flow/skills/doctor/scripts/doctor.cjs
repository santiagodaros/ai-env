#!/usr/bin/env node
// Diagnóstico del entorno ai-env en esta máquina y en este repo. Solo lee. Uso: node doctor.cjs [--json]
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const home = process.env.AI_ENV_HOME || os.homedir();
const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const rows = [];
const add = (res, name, detail = '') => rows.push({ res, name, detail });
const json = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const ver = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' }); return r.status === 0 ? (r.stdout || '').trim().split('\n')[0] : null; };

// Herramientas
const major = Number(process.versions.node.split('.')[0]);
add(major >= 18 ? 'OK' : 'FALLA', 'Node 18 o superior', `v${process.versions.node}`);
const g = ver('git', ['--version']); add(g ? 'OK' : 'FALLA', 'git en PATH', g || 'los hooks y las compuertas lo necesitan');
const c = ver('claude', ['--version']); add(c ? 'OK' : 'AVISO', 'claude en PATH', c || 'no se pudo consultar la versión desde esta terminal');

// Plugins activos (usuario + proyecto)
const us = json(path.join(home, '.claude', 'settings.json')) || {};
const ps = json(path.join(cwd, '.claude', 'settings.json')) || {};
const pl = json(path.join(cwd, '.claude', 'settings.local.json')) || {};
const en = { ...(us.enabledPlugins || {}), ...(ps.enabledPlugins || {}), ...(pl.enabledPlugins || {}) };
for (const p of ['guard', 'dev-flow', 'app-review', 'cloud-ops', 'front-studio']) {
  const k = Object.keys(en).find((x) => x === p || x.startsWith(p + '@'));
  if (k && en[k]) add('OK', `plugin ${p}`, k);
  else if (p === 'dev-flow') add('OK', 'plugin dev-flow', 'cargado en esta sesión (no figura en settings: --plugin-dir o sincronizado desde tu cuenta)');
  else if (p === 'guard') add('AVISO', `plugin ${p} no figura como activo en settings`, `claude plugin install ${p}@ai-env`);
  else add('INFO', `plugin ${p} no activo`, 'opcional');
}
const mk = (us.extraKnownMarketplaces || {})['ai-env'] || (ps.extraKnownMarketplaces || {})['ai-env'];
if (!mk) add('AVISO', 'marketplace ai-env no declarado en settings', 'claude plugin marketplace add santiagodaros/ai-env');
else add(mk.autoUpdate === true ? 'OK' : 'AVISO', 'actualización automática del marketplace', mk.autoUpdate === true ? 'activa' : 'apagada: esta máquina queda en el commit instalado. Corré /dev-flow:setup');

// Statusline y presupuesto
const sl = path.join(home, '.claude', 'ai-env', 'statusline.cjs');
const cmd = us.statusLine && us.statusLine.command || '';
if (!fs.existsSync(sl)) add('AVISO', 'statusline de ai-env no instalada', 'corré /dev-flow:setup; sin ella budget-plan no tiene datos');
else add(cmd.replace(/\\/g, '/').includes('.claude/ai-env/statusline.cjs') ? 'OK' : 'AVISO', 'statusline configurada', cmd || 'instalada pero settings.json no la usa: corré /dev-flow:setup');
const snap = json(path.join(process.env.CLAUDE_BUDGET_DIR || path.join(home, '.claude', '.budget'), 'latest.json'));
if (!snap) add('INFO', 'sin foto de consumo todavía', 'aparece tras la primera respuesta de una sesión interactiva (planes Pro/Max)');
else { const min = Math.round((Date.now() - snap.at) / 60000); add(snap.fiveHour ? 'OK' : 'INFO', 'foto de consumo', snap.fiveHour ? `5 h al ${snap.fiveHour.pct}% · hace ${min} min` : 'sin rate_limits: el plan no los informa'); }

// Interruptores
const sw = ['AI_ENV_HOOKS', 'AI_ENV_HOOKS_SKIP', 'AI_ENV_GUARD_STRICT'].filter((k) => process.env[k]).map((k) => `${k}=${process.env[k]}`);
add(sw.some((s) => /^AI_ENV_HOOKS=(off|0|false|no)$/i.test(s)) ? 'AVISO' : 'INFO', 'interruptores de hooks', sw.length ? sw.join(' ') : 'ninguno (todos los hooks activos)');

// Repo actual
const has = (f) => fs.existsSync(path.join(cwd, f));
if (!has('.git')) add('INFO', 'esta carpeta no es la raíz de un repo git', cwd);
else {
  add(has('docs/STATE.md') ? 'OK' : 'INFO', 'docs/STATE.md', has('docs/STATE.md') ? '' : 'falta: /dev-flow:project-init');
  const gi = has('.gitignore') ? fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8') : '';
  add(gi.includes('.claude/.feature-flow/') ? 'OK' : 'AVISO', '.gitignore cubre el estado local', gi.includes('.claude/.feature-flow/') ? '' : 'falta .claude/.feature-flow/: /dev-flow:project-init');
  const pkg = json(path.join(cwd, 'package.json'));
  if (pkg) { const miss = ['typecheck', 'lint', 'test'].filter((s) => !(pkg.scripts && pkg.scripts[s])); add(miss.length ? 'AVISO' : 'OK', 'scripts de verificación', miss.length ? `faltan: ${miss.join(', ')} (stop-verify y feature-close no verifican lo que no existe)` : 'typecheck, lint, test'); }
  if (has('architecture.json')) {
    try { const L = require('../../arch-first/scripts/archlib.cjs'); const st = L.approvalState(L.loadConfig(path.join(cwd, 'architecture.json'))); add(st.approved ? 'OK' : 'AVISO', 'arquitectura', st.approved ? 'aprobada' : `sin aprobar (${st.reason}): arch-guard bloquea el código`); }
    catch (e) { add('FALLA', 'architecture.json', e.message); }
  } else add('INFO', 'sin architecture.json', 'arch-guard no actúa en este repo');
}

if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
else { const w = Math.max(...rows.map((r) => r.name.length)); for (const r of rows) console.log(`${r.res.padEnd(6)} ${r.name.padEnd(w)}  ${r.detail}`); }
process.exit(rows.some((r) => r.res === 'FALLA') ? 1 : 0);
