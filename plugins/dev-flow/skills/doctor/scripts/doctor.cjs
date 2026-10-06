#!/usr/bin/env node
// Diagnóstico del entorno ai-env en esta máquina y en este repo. Solo lee. Uso: node doctor.cjs [--json]
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const home = process.env.AI_ENV_HOME || os.homedir();
const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const rows = [];
const add = (res, name, detail = '') => rows.push({ res, name, detail });
const json = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const ver = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' }); return r.status === 0 ? (r.stdout || '').trim().split('\n')[0] : null; };

// --- Estadística de uso de los hooks: node doctor.cjs --stats [--days N]
if (process.argv.includes('--stats')) {
  const i = process.argv.indexOf('--days'); const days = Math.max(1, Number(i >= 0 ? process.argv[i + 1] : 30) || 30);
  const f = path.join(home, '.claude', 'ai-env', 'usage.jsonl');
  const since = Date.now() - days * 86400000, agg = {};
  let n = 0;
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (!e || Date.parse(e.t) < since) continue;
    const k = `${e.hook}\t${e.rule}\t${e.d}`; agg[k] = (agg[k] || 0) + 1; n++;
  }
  const list = Object.entries(agg).map(([k, c]) => { const [hook, rule, d] = k.split('\t'); return { hook, rule, decision: d === 'block' ? 'bloqueó' : 'pidió confirmación', count: c }; }).sort((a, b) => b.count - a.count);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ days, total: n, rules: list }, null, 2));
  else if (!n) console.log(`Sin decisiones registradas en los últimos ${days} días.${fs.existsSync(f) ? '' : ' Todavía no existe el registro (' + f + ').'}${/^(off|0|false|no)$/i.test(process.env.AI_ENV_LOG || '') ? ' El registro está apagado (AI_ENV_LOG=off).' : ''}`);
  else {
    const w1 = Math.max(4, ...list.map((r) => r.hook.length)), w2 = Math.max(5, ...list.map((r) => r.rule.length));
    console.log(`Decisiones de los hooks en los últimos ${days} días: ${n}\n`);
    console.log(`${'hook'.padEnd(w1)}  ${'regla'.padEnd(w2)}  ${'decisión'.padEnd(18)}  veces`);
    for (const r of list) console.log(`${r.hook.padEnd(w1)}  ${r.rule.padEnd(w2)}  ${r.decision.padEnd(18)}  ${r.count}`);
    console.log('\nUna regla que interrumpe muchas veces es candidata a revisarse; una que nunca aparece no molesta. El registro no guarda comandos ni rutas.');
  }
  process.exit(0);
}

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

// Herramientas de infraestructura que usa cloud-ops:iac-verify (la que falta se saltea)
if (en[Object.keys(en).find((x) => x.startsWith('cloud-ops')) || ''] ) {
  const t = ver('terraform', ['version']);
  const b = ver('bicep', ['--version']) || ver('az', ['bicep', 'version']);
  const ps = ['pwsh', 'powershell'].map((c) => { const r = spawnSync(c, ['-NoProfile', '-NonInteractive', '-Command', "$a = if (Get-Module -ListAvailable -Name PSScriptAnalyzer) { 'con PSScriptAnalyzer' } else { 'sin PSScriptAnalyzer: solo errores de sintaxis' }; Write-Output ($PSVersionTable.PSVersion.ToString() + ' ' + $a)"], { encoding: 'utf8', timeout: 20000 }); return !r.error && r.status === 0 ? `${c} ${(r.stdout || '').trim()}` : null; }).find(Boolean);
  add('INFO', 'iac-verify: Terraform', t || 'no encontrado: los .tf no se verifican al terminar');
  add('INFO', 'iac-verify: Bicep', b || 'no encontrado: los .bicep no se verifican al terminar');
  add('INFO', 'iac-verify: PowerShell', ps || 'no encontrado: los .ps1 no se verifican al terminar');
}

// Interruptores
const sw = ['AI_ENV_HOOKS', 'AI_ENV_HOOKS_SKIP', 'AI_ENV_GUARD_STRICT', 'AI_ENV_LOG'].filter((k) => process.env[k]).map((k) => `${k}=${process.env[k]}`);
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
