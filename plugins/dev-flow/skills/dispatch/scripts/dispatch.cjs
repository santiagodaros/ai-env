#!/usr/bin/env node
// El Tech Lead lanza workers efímeros: un rol, un ticket, contexto en frío, worktree propio y salida estructurada.
// Uso:
//   node dispatch.cjs run --issue <N> --role implementer|sre|docs [--size T|S|M|L] [--mode headless|bg] [--launch]
//   node dispatch.cjs run --issues 12,13 --role implementer [--launch]     (lote paralelo: solo tickets independientes)
//   node dispatch.cjs run --pr <P> --role auditor [--issue <N>] [--launch]
//   node dispatch.cjs resume --run <id> [--max-turns N] [--launch]          (retoma la misma sesión desde progress.md)
//   node dispatch.cjs status [--json]  ·  collect --run <id> [--comment] [--show]
//   node dispatch.cjs stats [--days 30] [--json]
//   node dispatch.cjs plan set "12,13 | 14 | 15" [--goal "..."]  ·  plan show
//   node dispatch.cjs next [--issue <N>] [--json]                          el próximo paso de cada ticket, con su comando
//   node dispatch.cjs memory show [--role r] · memory propose · memory add --role r "lección"
// Sin --launch es un dry-run. Antes de lanzar corre `harness check --pre`: no se lanza sobre una base rota.
// Cada corrida copia los scripts del plugin a su carpeta (versión fijada: una actualización a mitad de camino no la rompe)
// y lleva un --session-id propio (para reanudarla). Lo que el worker hace queda en el expediente del ticket
// (.dev-flow/tickets/<N>/); al Tech Lead solo le llegan resúmenes de una línea y rutas.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const config = require('../../../lib/config.cjs');
const guard = require('../../../lib/launch-guard.cjs');
const { gh, ghJson, linkedIssue } = require('../../../lib/gh.cjs');
const card = require('./card.cjs');
const dossier = require('./dossier.cjs');

const argv = process.argv.slice(2);
const cmd = argv[0];
const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k) => argv.includes(k);
const fail = (m) => { console.error('RECHAZADO: ' + m); process.exit(1); };
const PLUGIN = path.join(__dirname, '..', '..', '..');
const ROLES = ['implementer', 'auditor', 'sre', 'docs'];
const SIZES = { S: { maxTurns: 30, effort: 'medium' }, M: { maxTurns: 60, effort: 'medium' }, L: { maxTurns: 100, effort: 'high', model: 'opus' } };
const MODELS = { implementer: 'sonnet', sre: 'sonnet', docs: 'haiku' }; // el auditor usa el de su definición (opus)
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

// Cómo invocar claude sin shell (el JSON del esquema no sobrevive a cmd.exe). AI_ENV_CLAUDE='["node","falso.cjs"]' en pruebas.
function claudeCmd() {
  if (process.env.AI_ENV_CLAUDE) { try { return JSON.parse(process.env.AI_ENV_CLAUDE); } catch { /* valor inválido */ } }
  if (process.platform !== 'win32') return ['claude'];
  const w = spawnSync('where', ['claude'], { encoding: 'utf8', windowsHide: true });
  const hits = (w.stdout || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const exe = hits.find((h) => /\.exe$/i.test(h));
  if (exe) return [exe];
  const shim = hits.find((h) => /\.cmd$/i.test(h));
  if (shim) { const js = path.join(path.dirname(shim), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'); if (fs.existsSync(js)) return [process.execPath, js]; }
  return ['claude'];
}

// Definición del rol (agents/<rol>.md): el cuerpo va como system prompt y el frontmatter da herramientas y modelo.
// No se usa --agent: en modo headless no resuelve agentes de plugin.
function roleDef(role, root) {
  const t = fs.readFileSync(path.join(PLUGIN, 'agents', `${role}.md`), 'utf8').replace(/\r\n/g, '\n');
  const m = t.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const fm = m ? m[1] : '';
  let body = (m ? m[2] : t).trim();
  const field = (k) => { const x = fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')); return x ? x[1].trim() : null; };
  const list = (k) => (field(k) || '').split(',').map((x) => x.trim()).filter(Boolean);
  // Reglas del proyecto (.claude/prompts/<rol>.md) y memoria aprobada del rol (.dev-flow/memory/<rol>.md): se suman.
  const own = read(path.join(root, '.claude', 'prompts', `${role}.md`)).trim();
  if (/^\s*-\s+\S/m.test(own)) body += `\n\n## Reglas del proyecto (.claude/prompts/${role}.md)\n\n${own}`;
  const mem = memoryOf(root, role);
  if (mem) body += `\n\n## Memoria del rol en este repo (lecciones aprobadas)\n\n${mem}`;
  return { body, model: field('model'), maxTurns: Number(field('maxTurns')) || null, disallowed: list('disallowedTools') };
}

function slugify(t) { return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^\[?[a-z]{1,4}-\d{1,4}\]?\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 4).join('-') || 'ticket'; }

// Alcance, dependencias y tamaño declarados en el issue (los escribe ticket.cjs desde el PRD).
function sectionOf(body, re) {
  const lines = String(body || '').split('\n');
  const i = lines.findIndex((l) => /^##\s/.test(l) && re.test(l));
  if (i < 0) return '';
  const j = lines.slice(i + 1).findIndex((l) => /^##\s/.test(l) || /^---\s*$/.test(l));
  return lines.slice(i + 1, j < 0 ? undefined : i + 1 + j).join('\n');
}
function scopeOf(issue) {
  const files = [...sectionOf(issue.body, /^##\s+Alcance/i).matchAll(/^\s*-\s+`?([^`\s(][^`\s]*)`?/gm)].map((m) => m[1].replace(/\\/g, '/'));
  const deps = [...sectionOf(issue.body, /^##\s+Dependencias/i).matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  const lab = (issue.labels || []).map((l) => l.name).find((x) => /^tama(ñ|n)o:[TSML]$/.test(x));
  const size = lab ? lab.slice(-1) : ((sectionOf(issue.body, /^##\s+Tama/i).match(/\b([TSML])\b/) || [])[1] || null);
  return { files, deps, size };
}
const overlap = (a, b) => a.some((x) => b.some((y) => x === y || x.startsWith(y.replace(/\/?\*+$/, '') + '/') || y.startsWith(x.replace(/\/?\*+$/, '') + '/')));

function memoryOf(root, role) {
  const t = read(path.join(root, '.dev-flow', 'memory', `${role}.md`)).trim();
  return t ? t.split('\n').filter((l) => /^\s*-\s+\S/.test(l)).slice(-40).join('\n') : '';
}

function codemapFor(root, files) {
  if (!files.length) return '';
  try { return require('./codemap.cjs').slice(root, files); } catch { return ''; }
}

// Copia del plugin para la corrida: lo que el worker ejecuta no cambia si el plugin se actualiza mientras trabaja.
function pinTools(runDir) {
  const dest = path.join(runDir, 'tools');
  fs.cpSync(PLUGIN, dest, { recursive: true, filter: (src) => !/[\\/](node_modules|evals|\.git)([\\/]|$)/.test(src) });
  return dest;
}

// Rutas de trabajo del worker, relativas a su worktree (ver dossier.WORK).
const WORK_PROGRESS = '.dev-flow/ticket/progress.md';
const WORK_CARD = '.dev-flow/ticket/card.json';
// Lo que las evals mostraron que hace perder turnos: la sesión con -w rechaza Write y redirecciones fuera del worktree,
// y los comandos compuestos con git o gh ("too complex to verify"); en el auditor, la lista de permitidos también.
const WORKTREE_RULES = (role) => [
  role === 'auditor' ? '- No escribas archivos.' : `- Escribí solo dentro de tu worktree (con Write o Edit, rutas relativas). El expediente y la carpeta de la corrida son de solo lectura para vos.`,
  '- Un comando por llamada a Bash, sin `&&`, `;`, `|`, `$(…)`, heredocs ni `echo $?`: el código de salida ya viene en el resultado. Con git y gh es obligatorio (si no, se rechaza).',
  '- Si algo se rechaza por permisos o por el aislamiento, no busques otra vía para lo mismo: anotalo en los puntos ciegos.',
];

function prompt({ role, issue, pr, runDir, toolsDir, base, modeHeadless, cardFile, ticketDir, codemap }) {
  const T = (rel) => path.join(toolsDir, rel);
  const C = `node "${T('skills/dispatch/scripts/card.cjs')}"`;
  const harness = `node "${T('skills/dispatch/scripts/harness.cjs')}" check --worker`;
  const scripts = role === 'auditor' ? [
    `- Auditoría determinista: node "${T('skills/audit/scripts/audit.cjs')}" --base ${base}`,
    `- Honestidad de pruebas: node "${T('skills/audit/scripts/test-honesty.cjs')}" --base ${base}`,
    cardFile ? `- Tarjeta del implementador: ${C} verify "${cardFile}" --base ${base} --run-tests`
      : /## Tarjeta de entrega/.test((pr && pr.body) || '') ? '- La tarjeta del implementador está en el cuerpo del PR (sección "Tarjeta de entrega"); no hay copia local para verify: contrastala a mano con el diff y las pruebas.'
        : '- No hay tarjeta del implementador (ni guardada ni en el cuerpo del PR): eso es un hallazgo de contrato.',
    `- Esquema del veredicto: ${T('skills/dispatch/schemas/verdict.schema.json')}`,
  ] : [
    `- Primero, el arnés en tu worktree (si da FALLA, no arranques): ${harness}`,
    `- Honestidad de pruebas: node "${T('skills/audit/scripts/test-honesty.cjs')}" --base ${base}`,
    `- Validar la tarjeta: ${C} check <archivo>`,
    `- Esquema de la tarjeta: ${T('skills/dispatch/schemas/card.schema.json')}`,
    ...(role === 'docs' ? [`- Estado del proyecto: node "${T('skills/ticket/scripts/estado.cjs')}" --write`, `- PRD: node "${T('skills/prd/scripts/prd.cjs')}" check`] : []),
    ...(has('--pr-after') ? [`- Abrir el PR: node "${T('skills/ticket/scripts/ticket.cjs')}" pr ${issue.number} --card ${WORK_CARD} --push`] : []),
  ];
  const out = role === 'auditor'
    ? 'Tu respuesta final es el JSON del veredicto (se valida con el esquema). No guardes archivos: no tenés permiso de escritura.'
    : modeHeadless
      ? `Tu respuesta final es el JSON de la tarjeta de entrega (se valida con el esquema). Incluí en "decisions" las decisiones de diseño con su motivo. Antes, guardala en ${WORK_CARD} (ruta relativa a tu worktree) y validala: ${C} check ${WORK_CARD}`
      : `Al terminar, guardá la tarjeta de entrega en ${WORK_CARD} (ruta relativa a tu worktree) y validala: ${C} check ${WORK_CARD}`;
  const L = [`Rol: ${role}. Rama base: ${base}.`];
  if (role === 'auditor') {
    L.push(`Auditá el PR #${pr.number}: ${pr.title}`, `${pr.url || ''}`, '', `Ticket enlazado: ${issue ? `#${issue.number} ${issue.title}` : 'ninguno (eso ya es un hallazgo de contrato)'}`);
    if (issue) L.push('', '## Ticket (alcance y criterios)', '', issue.body || '');
    L.push('', 'Estás en un worktree con la rama del PR. No edites archivos. No apruebes ni mergees.', 'No comentes en el PR: el Tech Lead publica tu veredicto.');
    L.push('', 'Si existen docs/conventions.md y docs/verification.md, sumá un chequeo por cada uno (pasa/falla con evidencia).');
  } else {
    L.push(`Ticket #${issue.number}: ${issue.title}`, issue.url || '', '', '## Ticket', '', issue.body || '');
    L.push('', `Trabajás en tu propio worktree, en la rama del ticket. ${has('--pr-after') ? 'Al terminar, abrí el PR con ticket.cjs pr.' : 'No abras el PR: lo abre el Tech Lead con tu tarjeta.'}`);
    L.push('', 'Si existe AGENTS.md en el repo, es el mapa: leé solo lo que te indique para esta tarea.');
  }
  const idx = read(path.join(ticketDir, 'index.md')).trim();
  L.push('', '## Expediente del ticket', '', `Carpeta: ${ticketDir}`);
  if (idx && role !== 'auditor') L.push('Lo que ya pasó en este ticket (resumen; no releas el código entero si esto alcanza):', '', idx);
  if (role !== 'auditor') L.push('', `Mantené ${WORK_PROGRESS} (ruta relativa a tu worktree; el arnés lo crea con lo de corridas anteriores y lo copia al expediente) al día MIENTRAS trabajás: plan, hecho, decisiones con motivo, siguiente paso. Si la corrida se corta, la siguiente arranca de ahí.`);
  L.push('', '## Reglas del worktree aislado', '', ...WORKTREE_RULES(role));
  if (codemap) L.push('', '## Mapa del código de tu alcance (docs/codemap.md)', '', codemap);
  L.push('', '## Scripts (rutas absolutas; versión fijada para esta corrida)', '', ...scripts, '', out,
    'Si una herramienta falla, reintentá una vez; si sigue fallando, no improvises un atajo: anotalo en progress.md y terminá con la tarjeta explicando el bloqueo.',
    'No abras otras sesiones ni subagentes.');
  return L.join('\n') + '\n';
}

function schemaArg(verdict) {
  const o = readJson(card.schemaPath(verdict));
  delete o.$schema; // el validador de Claude Code no resuelve el metaesquema 2020-12
  return JSON.stringify(o);
}

function preCheck(root) {
  if (has('--skip-check')) return 'chequeo previo salteado (--skip-check)';
  const r = spawnSync(process.execPath, [path.join(__dirname, 'harness.cjs'), 'check', '--pre', '--json'], { cwd: root, encoding: 'utf8' });
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* salida rara */ }
  if (!j) fail(`no pude correr el chequeo previo del arnés: ${(r.stderr || r.stdout || '').trim().slice(0, 200)}`);
  const bad = j.rows.filter((x) => x.res === 'FALLA');
  if (bad.length) fail(`el arnés no está en condiciones:\n- ${bad.map((x) => `${x.name}: ${x.detail}`).join('\n- ')}\n(node harness.cjs check --pre para ver todo)`);
  return `Arnés: ${j.rows.filter((x) => x.res === 'OK').length} OK, ${j.rows.filter((x) => x.res === 'AVISO').length} aviso(s).`;
}

function context(root, cfg, role, n, prN) {
  let issue = null, pr = null, name;
  if (role === 'auditor') {
    pr = ghJson(['pr', 'view', String(prN), '--json', 'number,title,body,headRefName,baseRefName,url,state']);
    if (pr.state && pr.state !== 'OPEN') fail(`el PR #${pr.number} está ${pr.state}.`);
    const i = get('--issue') || linkedIssue(pr);
    if (i) issue = ghJson(['issue', 'view', String(i), '--json', 'number,title,body,labels,url,state']);
    // Rama de ticket → mismo worktree que el del implementador si sigue en esta máquina; si no, se trae del remoto.
    name = /^(feat|fix|docs|chore)\/\d+-/.test(pr.headRefName || '') ? pr.headRefName.replace('/', '-') : `pr-${pr.number}`;
  } else {
    issue = ghJson(['issue', 'view', String(n), '--json', 'number,title,body,labels,url,state,assignees']);
    if (issue.state !== 'OPEN') fail(`#${issue.number} está ${issue.state}.`);
    if ((issue.labels || []).some((l) => l.name === cfg.labels.blocked)) fail(`#${issue.number} está bloqueado: resolvé la duda del issue antes de lanzar.`);
    const sc = scopeOf(issue);
    for (const d of sc.deps) {
      const di = ghJson(['issue', 'view', String(d), '--json', 'number,state']);
      if (di.state !== 'CLOSED') fail(`#${issue.number} depende de #${d}, que sigue abierto.`);
    }
    const type = role === 'docs' ? 'docs' : (issue.labels || []).some((l) => l.name === 'tipo:fix') ? 'fix' : 'feat';
    name = `${type}-${issue.number}-${slugify(issue.title)}`;
  }
  return { issue, pr, name };
}

function buildLaunch(root, cfg, role, ctx, mode, base) {
  const { issue, pr, name } = ctx;
  const W = cfg.workers || {};
  const key = `${role}-${role === 'auditor' ? `pr${pr.number}` : issue.number}`;
  const sc = issue ? scopeOf(issue) : { files: [], size: null };
  let size = (ctx.forceSize || get('--size') || sc.size || 'M').toUpperCase();
  if (size === 'T') size = 'S'; // un trivial que llegó hasta acá no calificó para quick-fix
  if (!SIZES[size]) fail('--size es T, S, M o L.');
  const sz = { ...SIZES[size], ...((W.sizes || {})[size] || {}) };
  const def = roleDef(role, root);
  // El modelo del tamaño (L → opus) es solo del implementer: docs y sre escalan turnos y esfuerzo, no de modelo.
  // El auditor siempre usa el de su definición. ctx.downgrade (--allow-downgrade-implementer) deja al implementer en su modelo de tabla.
  const tableModel = (W.models || {})[role] || (role === 'auditor' ? def.model : MODELS[role]) || def.model;
  const sizeModel = role === 'implementer' && !get('--model') ? sz.model : null;
  const model = get('--model') || (sizeModel && !ctx.downgrade ? sizeModel : null) || tableModel;
  const downgradable = !!sizeModel && sizeModel !== tableModel;
  const maxTurns = Number(get('--max-turns') || (role === 'auditor' ? def.maxTurns : sz.maxTurns) || W.maxTurns || 80);
  const effort = role === 'auditor' ? 'high' : sz.effort;
  const id = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)}-${key}`;
  const runDir = path.join(root, '.dev-flow', 'runs', id);
  const ticketN = issue ? issue.number : null;
  const ticketDir = ticketN ? dossier.dir(root, ticketN) : runDir;
  const cardFile = issue && fs.existsSync(path.join(root, '.dev-flow', 'cards', `${issue.number}.json`)) ? path.join(root, '.dev-flow', 'cards', `${issue.number}.json`) : null;
  const toolsDir = path.join(runDir, 'tools');
  const text = prompt({ role, issue, pr, runDir, toolsDir, base, modeHeadless: mode === 'headless', cardFile, ticketDir, codemap: codemapFor(root, sc.files) });
  const sessionId = crypto.randomUUID();
  const common = ['-w', name, '--session-id', sessionId, '--settings', path.join(runDir, 'settings.json'), '--add-dir', runDir, ...(ticketN ? ['--add-dir', ticketDir] : []),
    '--append-system-prompt', def.body, ...(def.disallowed.length ? ['--disallowedTools', def.disallowed.join(',')] : []), ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : [])];
  const perms = role === 'auditor'
    ? ['--permission-mode', 'default', '--allowedTools', ['Read', 'Glob', 'Grep', 'Bash(git *)', 'Bash(ls *)', 'Bash(gh pr *)', 'Bash(gh issue view *)', 'Bash(node *)', 'Bash(npm test*)', 'Bash(npm run *)', 'Bash(pnpm *)', 'Bash(npx *)', 'PowerShell'].join(',')]
    : ['--permission-mode', W.permissionMode || 'auto', '--allowedTools', (W.allowedTools || []).join(',')];
  const args = mode === 'headless'
    ? ['-p', ...common, ...perms, '--output-format', 'json', '--json-schema', schemaArg(role === 'auditor'), '--max-turns', String(maxTurns)]
    : ['--bg', ...common, ...perms, '-n', name, `Leé tus instrucciones en ${path.join(runDir, 'prompt.md')} y seguilas.`];
  return { key, id, runDir, ticketN, ticketDir, text, args, name, size, model, maxTurns, effort, sessionId, files: sc.files, downgradable, downgraded: !!ctx.downgrade && downgradable, fromModel: sizeModel, tableModel };
}

function settingsFor(toolsDir) {
  const w = path.join(toolsDir, 'hooks', 'worktree.cjs').replace(/\\/g, '/');
  // El hook de worktrees por settings: así `-w` también crea el worktree fuera del repo (el del plugin no alcanza al flag).
  return { hooks: { WorktreeCreate: [{ hooks: [{ type: 'command', command: `node "${w}" create`, timeout: 120 }] }], WorktreeRemove: [{ hooks: [{ type: 'command', command: `node "${w}" remove`, timeout: 90 }] }] } };
}

function spawnWorker(root, L, mode, role, issue, pr, cwd, extra = {}) {
  fs.mkdirSync(L.runDir, { recursive: true });
  const toolsDir = pinTools(L.runDir);
  fs.writeFileSync(path.join(L.runDir, 'prompt.md'), L.text);
  fs.writeFileSync(path.join(L.runDir, 'settings.json'), JSON.stringify(settingsFor(toolsDir), null, 2));
  if (L.ticketN) dossier.init(root, L.ticketN, { title: issue ? issue.title : '', brief: issue ? issue.body : '' });
  const env = { ...process.env, FEATURE_FLOW_CHILD: '1', DEV_FLOW_ROLE: role, DEV_FLOW_RUN: L.id, ...(L.ticketN ? { DEV_FLOW_TICKET: String(L.ticketN), DEV_FLOW_DOSSIER: L.ticketDir } : {}) };
  const [exe, ...pre] = claudeCmd();
  const pluginVersion = (readJson(path.join(PLUGIN, '.claude-plugin', 'plugin.json')) || {}).version;
  const meta = { id: L.id, role, mode, key: L.key, kind: 'worker', issue: issue ? issue.number : null, pr: pr ? pr.number : null, worktree: L.name, runDir: L.runDir, ticketDir: L.ticketDir, size: L.size, model: L.model || null, ...(L.downgraded ? { downgradedFrom: L.fromModel } : {}), maxTurns: L.maxTurns, session: L.sessionId, pluginVersion, at: Date.now(), ...extra };
  if (mode === 'headless') {
    const out = fs.openSync(path.join(L.runDir, 'out.json'), 'w'), errf = fs.openSync(path.join(L.runDir, 'err.log'), 'w');
    const inp = fs.openSync(path.join(L.runDir, 'prompt.md'), 'r');
    const child = spawn(exe, [...pre, ...L.args], { cwd, env, detached: true, stdio: [inp, out, errf], windowsHide: true });
    child.on('error', (e) => { fs.appendFileSync(path.join(L.runDir, 'err.log'), `spawn: ${e.message}\n`); });
    child.unref();
    meta.pid = child.pid;
  } else {
    const r = spawnSync(exe, [...pre, ...L.args], { cwd, env, encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) fail(`claude devolvió error: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`);
  }
  fs.writeFileSync(path.join(L.runDir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

function repoContext() {
  if (process.env.FEATURE_FLOW_CHILD) fail('esta sesión es un worker: no puede lanzar otros.');
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.status !== 0) fail('no estás dentro de un repo git.');
  const root = dossier.mainRoot(top.stdout.trim());
  const cfg = config.load(root);
  const base = (spawnSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd: root, encoding: 'utf8' }).stdout || '').trim().replace(/^origin\//, '') || 'main';
  return { root, cfg, base };
}

function run() {
  const role = get('--role');
  if (!ROLES.includes(role)) fail(`--role tiene que ser ${ROLES.join(', ')}.`);
  const { root, cfg, base } = repoContext();
  const mode = get('--mode') || (cfg.workers || {}).mode || 'headless';
  if (!['headless', 'bg'].includes(mode)) fail('--mode es headless o bg.');
  if (role === 'auditor' && mode !== 'headless') fail('el auditor corre solo en modo headless: no tiene permiso de escritura y su veredicto sale validado por esquema.');
  const batch = get('--issues');
  let targets;
  if (role === 'auditor') { if (!/^\d+$/.test(get('--pr') || '')) fail('el auditor necesita --pr <número>.'); targets = [{ pr: get('--pr') }]; }
  else if (batch) { if (!/^\d+(,\d+)+$/.test(batch)) fail('--issues espera números separados por coma (al menos dos).'); targets = batch.split(',').map((n) => ({ n })); }
  else { if (!/^\d+$/.test(get('--issue') || '')) fail('falta --issue <número>.'); targets = [{ n: get('--issue') }]; }
  let ctxs;
  try { ctxs = targets.map((t) => context(root, cfg, role, t.n, t.pr)); } catch (e) { fail(e.message); }
  if (ctxs.length > 1) {
    // Paralelo seguro: cada ticket declara su alcance y ninguno pisa archivos de otro ni depende de otro del lote.
    const scopes = ctxs.map((c) => ({ n: c.issue.number, ...scopeOf(c.issue) }));
    const blind = scopes.filter((s) => !s.files.length);
    if (blind.length) fail(`para lanzar en paralelo cada ticket tiene que declarar su alcance (## Alcance). Sin alcance: ${blind.map((s) => `#${s.n}`).join(', ')}.`);
    for (let i = 0; i < scopes.length; i++) for (let j = i + 1; j < scopes.length; j++) {
      if (overlap(scopes[i].files, scopes[j].files)) fail(`#${scopes[i].n} y #${scopes[j].n} tocan los mismos archivos: van en serie, no en paralelo.`);
      if (scopes[i].deps.includes(scopes[j].n) || scopes[j].deps.includes(scopes[i].n)) fail(`#${scopes[i].n} y #${scopes[j].n} dependen uno del otro: van en serie.`);
    }
  }
  // Tamaño T (trivial): no se lanza sesión. Si las rutas del alcance califican para quick-fix, va por ahí en esta
  // sesión; si no, se trata como S y se dice por qué.
  if (role !== 'auditor') {
    const QF = path.join(__dirname, '..', '..', 'quick-fix', 'scripts', 'quick.cjs');
    const keep = [];
    for (const c of ctxs) {
      const sc = scopeOf(c.issue);
      if ((get('--size') || sc.size || '').toUpperCase() !== 'T') { keep.push(c); continue; }
      if (!sc.files.length) { console.log(`#${c.issue.number} es trivial pero no declara su alcance (## Alcance): se trata como S.`); c.forceSize = 'S'; keep.push(c); continue; }
      const q = spawnSync(process.execPath, [QF, '--plan', sc.files.join(','), '--json'], { cwd: root, encoding: 'utf8' });
      let j = {}; try { j = JSON.parse(q.stdout); } catch { /* salida rara */ }
      if (q.status === 0 && j.ok) {
        console.log(`#${c.issue.number} es trivial y sus rutas califican para quick-fix: no lanzo sesión.\n  Seguí en esta sesión: /dev-flow:quick-fix (#${c.issue.number}: ${c.issue.title}). Para contexto limpio, delegalo a un subagente dev-flow:implementer en esta misma sesión.\n  El contenido del diff se evalúa al final con quick.cjs; si no califica, vuelve al flujo con auditor.`);
        continue;
      }
      console.log(`#${c.issue.number} figura como trivial pero NO califica para quick-fix (${(j.why || ['sin detalle']).join('; ')}): se trata como S, con worker y auditor.`);
      c.forceSize = 'S'; keep.push(c);
    }
    if (!keep.length) return;
    ctxs = keep;
  }
  const pc = preCheck(root);
  const claude = claudeCmd();
  const launches = ctxs.map((c) => buildLaunch(root, cfg, role, c, mode, base));
  const c0 = guard.check(root, launches[0].key, claude, { repeatHours: role === 'auditor' ? 1 : 24 });
  if (!c0.ok) fail(c0.msg);
  if (launches.length > 1) {
    if (c0.info.running.total + launches.length > c0.info.maxConcurrent) fail(`el lote necesita ${launches.length} cupos y hay ${c0.info.maxConcurrent - c0.info.running.total} libres (tope ${c0.info.maxConcurrent}).`);
    if (c0.info.today + launches.length > c0.info.maxPerDay) fail(`el lote supera el tope de ${c0.info.maxPerDay} lanzamientos en 24 h (${c0.info.today} usados).`);
    const reg = guard.readReg(root);
    for (const L of launches.slice(1)) if (reg.some((r) => (r.key || r.slug) === L.key && Date.now() - r.at < 86400000)) fail(`"${L.key}" ya se lanzó en las últimas 24 h.`);
  }
  // Presupuesto del LOTE completo (antes se miraba solo el primer worker): entran k de n; el resto queda en cola.
  if (has('--allow-downgrade-implementer') && role !== 'implementer') fail('--allow-downgrade-implementer solo aplica a implementers: el auditor, sre y docs no cambian de modelo.');
  let b = budgetBatch(root, role, launches, c0.info.running.total);
  if (b.launchable < launches.length && launches.some((L) => L.downgradable)) {
    // Alternativa informativa: los implementers que el tamaño subió a otro modelo, en su modelo de tabla. El auditor no cambia.
    const to = launches.find((L) => L.downgradable).tableModel;
    const alt = budgetBatch(root, role, launches, c0.info.running.total, { model: to });
    const n = launches.filter((L) => L.downgradable).length;
    if (alt.perWorker === null) console.log(`Alternativa: bajar ${n} implementer(s) de ${launches.find((L) => L.downgradable).fromModel} a ${to} no se puede estimar todavía (hacen falta 3 corridas solas de implementer en ${to}). El auditor no cambia.`);
    else if (alt.launchable <= b.launchable) console.log(`Alternativa: bajar los implementers a ${to} no hace entrar más tickets (entran ${alt.launchable} de ${launches.length} igual). El auditor no cambia.`);
    else if (has('--allow-downgrade-implementer')) {
      ctxs.forEach((c, i) => { if (launches[i].downgradable) c.downgrade = true; });
      launches.splice(0, launches.length, ...ctxs.map((c) => buildLaunch(root, cfg, role, c, mode, base)));
      b = alt;
      console.log(`--allow-downgrade-implementer: ${n} implementer(s) bajan a ${to} para este lote (entran ${alt.launchable} de ${launches.length}). Turnos y esfuerzo siguen los del tamaño. El auditor no cambia: sigue en su modelo.`);
    } else console.log(`Alternativa: con los ${n} implementer(s) de tamaño L en ${to} en vez de ${launches.find((L) => L.downgradable).fromModel}, entrarían ${alt.launchable - b.launchable} ticket(s) más (${alt.launchable} de ${launches.length}). El auditor no cambia. Para aplicarlo, repetí con --allow-downgrade-implementer.`);
  }
  if (b.launchable === 0) fail(b.text);
  if (b.launchable < launches.length) {
    const queued = launches.slice(b.launchable).map((L) => L.ticketN).filter(Boolean);
    launches.splice(b.launchable);
    if (has('--launch') && queued.length) queueInPlan(root, queued);
    console.log(`${b.text}\nSe ${has('--launch') ? 'lanzan' : 'lanzarían'} ${launches.length}; quedan en cola: ${queued.map((n) => `#${n}`).join(', ')} (dispatch plan show). Lanzalos cuando terminen los que corren o después del reinicio.`);
  }
  for (const L of launches) {
    const c = ctxs[launches.indexOf(L)];
    console.log(`Worker: ${role} ${role === 'auditor' ? `PR #${c.pr.number}` : `#${c.issue.number}`} (${mode}, tamaño ${L.size}, modelo ${L.model || 'por defecto'}${L.downgraded ? ` (bajado de ${L.fromModel} por presupuesto)` : ''}, ${L.maxTurns} turnos${L.effort ? `, esfuerzo ${L.effort}` : ''})`);
    console.log(`  worktree ${L.name} · corrida ${L.id}${L.files.length ? ` · alcance ${L.files.join(', ')}` : ''}`);
  }
  console.log(`Cupos: ${c0.info.running.total}/${c0.info.maxConcurrent} en segundo plano, ${c0.info.today}/${c0.info.maxPerDay} lanzadas en 24 h, espera mínima ${c0.info.cooldown} min.`);
  console.log(`${pc}  ${b.text}`);
  console.log(`Comando: ${[...claude, ...launches[0].args.map((a) => (a.length > 80 ? a.slice(0, 60) + '…' : a))].join(' ')}`);
  console.log(`\n--- prompt (${launches[0].text.length} caracteres) ---\n${launches[0].text.slice(0, 1500)}${launches[0].text.length > 1500 ? '\n[…]' : ''}`);
  if (!has('--launch')) { console.log('\nDry-run: no se lanzó nada. Agregá --launch para lanzar.'); return; }
  const at = Date.now();
  for (const L of launches) {
    const c = ctxs[launches.indexOf(L)];
    const meta = spawnWorker(root, L, mode, role, c.issue, c.pr, root, { batch: launches.length > 1 ? launches.map((x) => x.key) : undefined });
    guard.record(root, { key: L.key, kind: 'worker', mode, pid: meta.pid, run: L.id, at });
  }
  console.log(`\nLanzado${launches.length > 1 ? `s ${launches.length} workers en paralelo` : ''}. Seguilo con: node "${__filename}" status`);
}

function resume() {
  const { root, cfg } = repoContext();
  const prev = runs(root).find((x) => x.id === get('--run'));
  if (!prev) fail(`no encuentro la corrida ${get('--run')} (mirá status).`);
  if (prev.state === 'corriendo') fail(`la corrida ${prev.id} sigue corriendo.`);
  if (!prev.session || prev.mode !== 'headless') fail('solo se reanudan corridas headless lanzadas con esta versión (tienen --session-id).');
  const wt = require('../../../hooks/worktree.cjs').plan(root, prev.worktree).dest;
  if (!fs.existsSync(wt)) fail(`el worktree ${wt} ya no existe: lanzá una corrida nueva sobre el ticket.`);
  const k = runs(root).filter((x) => x.parent === prev.id || (x.id.startsWith(prev.id + '-r'))).length + 1;
  const id = `${prev.id}-r${k}`;
  const runDir = path.join(root, '.dev-flow', 'runs', id);
  const verdict = prev.role === 'auditor';
  const text = `Retomá el trabajo interrumpido (${prev.state}). ${verdict ? 'Seguí la auditoría donde quedó, sin repetir lo ya revisado.' : `Leé ${WORK_PROGRESS} (en tu worktree) y seguí desde "Siguiente paso". No rehagas lo que ya está hecho y commiteado.`}\nAl terminar, tu respuesta final es el JSON ${verdict ? 'del veredicto' : 'de la tarjeta de entrega'} completo (se valida con el esquema).\n`;
  const maxTurns = Number(get('--max-turns') || 40);
  const args = ['-p', '-r', prev.session, '--add-dir', runDir, ...(prev.ticketDir ? ['--add-dir', prev.ticketDir] : []), '--permission-mode', verdict ? 'default' : ((cfg.workers || {}).permissionMode || 'auto'), '--allowedTools', ((cfg.workers || {}).allowedTools || []).join(','), '--output-format', 'json', '--json-schema', schemaArg(verdict), '--max-turns', String(maxTurns)];
  const c = guard.check(root, `${prev.key}-r${k}`, claudeCmd(), { repeatHours: 0 });
  if (!c.ok) fail(c.msg);
  console.log(`Reanudar ${prev.id} → ${id} en ${wt} (sesión ${prev.session}, ${maxTurns} turnos)`);
  if (!has('--launch')) { console.log('Dry-run: agregá --launch para reanudar.'); return; }
  const L = { id, runDir, key: `${prev.key}-r${k}`, ticketN: prev.issue, ticketDir: prev.ticketDir, text, args, name: prev.worktree, size: prev.size, model: prev.model, maxTurns, sessionId: prev.session };
  const meta = spawnWorker(root, L, 'headless', prev.role, prev.issue ? { number: prev.issue, title: '', body: '' } : null, prev.pr ? { number: prev.pr } : null, wt, { parent: prev.id });
  guard.record(root, { key: L.key, kind: 'worker', mode: 'headless', pid: meta.pid, run: id });
  console.log('Reanudado. Seguilo con status.');
}

let wtMod = null;
const worktreeMod = () => wtMod || (wtMod = require('../../../hooks/worktree.cjs'));

function runs(root) {
  const dir = path.join(root, '.dev-flow', 'runs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().reverse().map((id) => {
    const d = path.join(dir, id);
    const meta = readJson(path.join(d, 'meta.json'));
    if (!meta) return null;
    const verdict = meta.role === 'auditor';
    const r = { ...meta, state: 'corriendo', result: null, errors: [], out: null };
    const raw = read(path.join(d, 'out.json')).trim();
    // Tarjeta en archivo: la que guardó collect en la corrida o la copia de trabajo del worker en su worktree.
    // Mientras un headless sigue vivo y sin out.json, NO cuenta como terminado aunque ya haya guardado la tarjeta.
    const candidates = [path.join(d, verdict ? 'verdict.json' : 'card.json')];
    if (!verdict && meta.worktree) { try { candidates.push(path.join(worktreeMod().plan(root, meta.worktree).dest, dossier.WORK, 'card.json')); } catch { /* nombre raro */ } }
    const fileF = candidates.find((f) => { try { return fs.statSync(f).mtimeMs >= (meta.at || 0) - 1000; } catch { return false; } });
    const stillRunning = meta.mode === 'headless' && !raw && guard.alive(meta.pid);
    if (meta.mode === 'headless' && raw) {
      r.state = 'terminado';
      try { const j = JSON.parse(raw); r.out = j; r.cost = j.total_cost_usd; r.turns = j.num_turns; r.durationMs = j.duration_ms; if (j.is_error || /error/.test(j.subtype || '')) r.state = `error (${j.subtype || 'is_error'})`; } catch { /* no es JSON */ }
      try { r.result = card.extract(raw); } catch (e) { r.errors.push(e.message); }
    }
    if (!r.result && fileF && !stillRunning) { const j = readJson(fileF); if (j) { r.result = j; if (r.state === 'corriendo') r.state = 'terminado'; } }
    if (meta.mode === 'headless' && !raw && !guard.alive(meta.pid)) { r.state = 'terminó sin salida'; const e = read(path.join(d, 'err.log')).trim(); if (e) r.errors.push(e.split('\n').slice(-3).join(' | ')); }
    if (r.result) r.errors.push(...card.validate(r.result, verdict));
    return r;
  }).filter(Boolean);
}

// Métricas por corrida terminada (sin contenido): costo, turnos, duración, modelo, permisos denegados, resultado.
// Foto del límite de 5 h (la escribe la statusline) y estimación por worker para el presupuesto del lote.
const budgetSnap = () => readJson(path.join(process.env.CLAUDE_BUDGET_DIR || path.join(require('os').homedir(), '.claude', '.budget'), 'latest.json'));
const metricsOf = (root) => read(path.join(root, '.dev-flow', 'metrics.jsonl')).split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const median = (a) => { const v = [...a].sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
function budgetBatch(root, role, launches, running, opt = {}) {
  // opt.model: estimar con las corridas medidas en ese modelo (alternativa de bajar implementers).
  const M = metricsOf(root).filter((m) => m.role === role && m.durationMs > 0 && (!opt.model || m.model === opt.model));
  const minutes = median(M.slice(-20).map((m) => m.durationMs / 60000)) || 15;
  const solo = M.filter((m) => typeof m.deltaPct === 'number' && m.solo).map((m) => m.deltaPct).sort((x, y) => x - y);
  const per = solo.length >= 3 ? solo[Math.min(solo.length - 1, Math.ceil(0.75 * solo.length) - 1)] : null;
  if (opt.model && per === null) return { launchable: 0, perWorker: null, text: '' };
  const bp = path.join(__dirname, '..', '..', 'budget-plan', 'scripts', 'budget.cjs');
  const args = [bp, 'batch', String(launches.length), '--minutes', String(Math.round(minutes)), '--running', String(running), '--json', ...(per !== null ? ['--per-worker', String(per)] : [])];
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  try { const j = JSON.parse(r.stdout); return { launchable: Number.isInteger(j.launchable) ? j.launchable : launches.length, perWorker: per, text: j.text }; }
  catch { return { launchable: launches.length, perWorker: per, text: 'Presupuesto: sin datos.' }; }
}
function queueInPlan(root, issues) {
  const f = path.join(root, '.dev-flow', 'plan.json');
  const p = readJson(f) || { goal: '', waves: [] };
  p.queued = [...new Set([...(p.queued || []), ...issues])];
  p.updated = new Date().toISOString();
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\n');
}
// % del límite de 5 h que consumió una corrida: muestra más cercana al inicio y al fin (±3 min, misma ventana).
// `solo` = no se superpuso con otra corrida: solo esas sirven para estimar por worker.
function deltaPctOf(root, r) {
  const snap = budgetSnap();
  const S = (snap && snap.samples) || [];
  if (!r.durationMs || !S.length) return {};
  const near = (t) => S.reduce((best, x) => (Math.abs(x.at - t) < Math.abs((best || { at: Infinity }).at - t) ? x : best), null);
  const a = near(r.at), z = near(r.at + r.durationMs);
  if (!a || !z || Math.abs(a.at - r.at) > 180000 || Math.abs(z.at - (r.at + r.durationMs)) > 180000 || a.resetsAt !== z.resetsAt || z.pct < a.pct) return {};
  const others = runs(root).filter((o) => o.id !== r.id && o.at < r.at + r.durationMs && (o.at + (o.durationMs || 0)) > r.at);
  return { deltaPct: Math.round((z.pct - a.pct) * 10) / 10, solo: others.length === 0 };
}

function recordMetrics(root, r) {
  if (r.state === 'corriendo') return;
  const f = path.join(root, '.dev-flow', 'metrics.jsonl');
  if (read(f).includes(`"run":"${r.id}"`)) return;
  const denials = ((r.out && r.out.permission_denials) || []).map((x) => `${x.tool_name}${x.tool_input && x.tool_input.command ? `(${String(x.tool_input.command).trim().split(/\s+/)[0]})` : ''}`);
  const res = r.result || {};
  const m = { run: r.id, at: new Date(r.at).toISOString(), role: r.role, issue: r.issue, pr: r.pr, size: r.size, model: r.model, state: r.state, cost: r.cost ?? null, turns: r.turns ?? null, durationMs: r.durationMs ?? null, denials, valid: !!r.result && !card.validate(r.result, r.role === 'auditor').length,
    verdict: res.verdict || null, findings: (res.findings || []).map((x) => `${x.severity}:${x.area}`), testsHonest: res.tests_honest || (res.tests ? res.tests.fail_without_change : null), testsPassed: res.tests ? res.tests.passed : null, parent: r.parent || null, ...deltaPctOf(root, r) };
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify(m) + '\n');
}

function oneLine(r) {
  const what = r.role === 'auditor' ? `PR #${r.pr}` : `#${r.issue}`;
  const res = r.result ? (r.role === 'auditor' ? `veredicto ${String(r.result.verdict || '?').toUpperCase()}` : `tarjeta: ${(r.result.acceptance || []).filter((a) => a.status === 'cumple').length}/${(r.result.acceptance || []).length} criterios, pruebas ${r.result.tests && r.result.tests.passed ? 'pasan' : 'NO pasan'}, sin el cambio fallan: ${r.result.tests ? r.result.tests.fail_without_change : '?'}`) : '';
  return `${r.id}  ${r.role.padEnd(11)} ${what.padEnd(7)} ${r.state}${res ? ` — ${res}` : ''}${r.cost ? ` · US$ ${Number(r.cost).toFixed(2)}` : ''}`;
}

function status() {
  const root = dossier.mainRoot(process.cwd());
  const list = runs(root).filter((r) => Date.now() - r.at < 3 * 86400000);
  for (const r of list) recordMetrics(root, r);
  if (has('--json')) { console.log(JSON.stringify(list.map(({ out, ...x }) => x), null, 2)); return; }
  if (!list.length) { console.log('No hay corridas de workers en los últimos 3 días.'); return; }
  for (const r of list) {
    console.log(oneLine(r));
    for (const e of r.errors.filter(Boolean)) console.log(`    ! ${e}`);
    if (/max_turns|sin salida/.test(r.state) && r.session) console.log(`    → reanudable: node "${__filename}" resume --run ${r.id} --max-turns 40`);
  }
}

function collect() {
  const root = dossier.mainRoot(process.cwd());
  const r = runs(root).find((x) => x.id === get('--run'));
  if (!r) fail(`no encuentro la corrida ${get('--run')} (mirá status).`);
  if (!r.result) fail(`la corrida ${r.id} todavía no tiene ${r.role === 'auditor' ? 'veredicto' : 'tarjeta'} (${r.state}).`);
  const verdict = r.role === 'auditor';
  const errs = card.validate(r.result, verdict);
  if (errs.length) fail(`${verdict ? 'veredicto' : 'tarjeta'} inválida:\n- ${errs.join('\n- ')}`);
  // Alcance: un archivo fuera de "## Alcance" sin justificar en scope_extensions frena el ticket antes de la auditoría.
  if (!verdict && r.issue) {
    let scope = [];
    try { scope = card.scopeFromBody(ghJson(['issue', 'view', String(r.issue), '--json', 'body']).body); } catch { /* sin gh: lo verifica el auditor con card verify --issue */ }
    const out = card.outOfScope(r.result.files_changed || [], scope, r.result);
    if (out.length) fail(`la tarjeta de #${r.issue} toca archivos fuera del Alcance sin justificar: ${out.join(', ')}.\nAlternativa: dispatch resume --run ${r.id} pidiendo revertirlos o justificarlos en scope_extensions (archivo y motivo); lo que vio y no le tocaba va en noticed_out_of_scope.`);
  }
  const dest = path.join(root, '.dev-flow', verdict ? 'verdicts' : 'cards', `${verdict ? r.pr : r.issue}.json`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(r.result, null, 2) + '\n');
  if (!fs.existsSync(path.join(r.runDir, verdict ? 'verdict.json' : 'card.json'))) fs.writeFileSync(path.join(r.runDir, verdict ? 'verdict.json' : 'card.json'), JSON.stringify(r.result, null, 2) + '\n');
  recordMetrics(root, r);
  let rec = null;
  const ticketN = r.issue;
  if (ticketN) rec = dossier.record(root, ticketN, r.runDir);
  const md = card.render(r.result, verdict);
  // Solo una línea y rutas: el contenido vive en disco (regla anti teléfono descompuesto).
  console.log(oneLine(r));
  console.log(`  guardado: ${path.relative(root, dest)}${rec && rec.report ? ` · expediente: ${path.relative(root, path.join(rec.dir, rec.report))} · índice: ${path.relative(root, path.join(rec.dir, 'index.md'))}` : ''}`);
  console.log(`  siguiente: node "${__filename}" next${r.issue ? ` --issue ${r.issue}` : ''}`);
  const noticed = (!verdict && r.result.noticed_out_of_scope) || [];
  if (noticed.length) console.log(`  visto y no tocado: ${noticed.length} (en el expediente; candidatos a ticket nuevo)`);
  if (has('--show')) console.log(`\n${md}`);
  if (has('--comment')) {
    const f = path.join(r.runDir, 'comment.md'); fs.writeFileSync(f, md);
    gh(verdict ? ['pr', 'comment', String(r.pr), '--body-file', f] : ['issue', 'comment', String(r.issue), '--body-file', f]);
    console.log(`  comentado en ${verdict ? `el PR #${r.pr}` : `el issue #${r.issue}`}.`);
  }
}

function stats() {
  const root = dossier.mainRoot(process.cwd());
  for (const r of runs(root)) recordMetrics(root, r);
  const days = Number(get('--days') || 30);
  const since = Date.now() - days * 86400000;
  const ms = read(path.join(root, '.dev-flow', 'metrics.jsonl')).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((m) => m && Date.parse(m.at) >= since);
  const by = {};
  for (const m of ms) (by[m.role] = by[m.role] || []).push(m);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const roles = Object.entries(by).map(([role, l]) => ({
    role, runs: l.length, valid: l.filter((m) => m.valid).length, cost: avg(l.map((m) => m.cost).filter((x) => x !== null)), turns: avg(l.map((m) => m.turns).filter((x) => x !== null)),
    errors: l.filter((m) => /error|sin salida/.test(m.state)).length, resumed: l.filter((m) => m.parent).length,
    verdicts: l.reduce((a, m) => (m.verdict ? { ...a, [m.verdict]: (a[m.verdict] || 0) + 1 } : a), {}),
    honest: l.filter((m) => m.testsHonest === 'si').length,
  }));
  const tickets = {};
  for (const m of ms.filter((x) => x.role === 'implementer' && x.issue && !x.parent)) tickets[m.issue] = (tickets[m.issue] || 0) + 1;
  const rework = Object.entries(tickets).filter(([, n]) => n > 1).map(([t, n]) => `#${t} (${n} implementaciones)`);
  const den = {};
  for (const m of ms) for (const d of m.denials || []) den[d] = (den[d] || 0) + 1;
  const findings = {};
  for (const m of ms) for (const f of m.findings || []) findings[f] = (findings[f] || 0) + 1;
  const outp = { days, runs: ms.length, cost: ms.reduce((a, m) => a + (m.cost || 0), 0), roles, rework, denials: Object.entries(den).sort((a, b) => b[1] - a[1]), findings: Object.entries(findings).sort((a, b) => b[1] - a[1]) };
  if (has('--json')) { console.log(JSON.stringify(outp, null, 2)); return; }
  if (!ms.length) { console.log(`Sin corridas en los últimos ${days} días.`); return; }
  console.log(`Workers en los últimos ${days} días: ${ms.length} corrida(s), US$ ${outp.cost.toFixed(2)} en total.\n`);
  for (const r of roles) console.log(`${r.role.padEnd(11)} ${String(r.runs).padStart(3)} corridas · ${r.valid}/${r.runs} con salida válida · US$ ${r.cost !== null ? r.cost.toFixed(2) : '?'} y ${r.turns !== null ? Math.round(r.turns) : '?'} turnos promedio${r.errors ? ` · ${r.errors} cortadas` : ''}${r.resumed ? ` · ${r.resumed} reanudadas` : ''}${r.role === 'auditor' ? ` · ${Object.entries(r.verdicts).map(([k, v]) => `${k} ${v}`).join(', ')}` : ` · pruebas honestas ${r.honest}/${r.runs}`}`);
  if (rework.length) console.log(`\nRetrabajo: ${rework.join(', ')}`);
  if (outp.denials.length) console.log(`\nPermisos denegados (candidatos para workers.allowedTools): ${outp.denials.slice(0, 8).map(([d, n]) => `${d} ×${n}`).join(', ')}`);
  if (outp.findings.length) console.log(`\nHallazgos más repetidos del auditor: ${outp.findings.slice(0, 6).map(([f, n]) => `${f} ×${n}`).join(', ')}  (dispatch memory propose)`);
}

// Plan del Tech Lead: oleadas de tickets. rehydrate lo reinyecta tras compactar.
function plan() {
  const root = dossier.mainRoot(process.cwd());
  const f = path.join(root, '.dev-flow', 'plan.json');
  if (argv[1] === 'set') {
    const spec = argv[2];
    if (!spec || !/^[\d,\s|]+$/.test(spec)) fail('Uso: plan set "12,13 | 14 | 15" [--goal "objetivo"]');
    const waves = spec.split('|').map((w) => w.split(',').map((x) => Number(x.trim())).filter(Boolean)).filter((w) => w.length);
    const p = { goal: get('--goal') || (readJson(f) || {}).goal || '', waves, updated: new Date().toISOString() };
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\n');
    console.log(`Plan guardado: ${waves.map((w, i) => `ola ${i + 1}: ${w.map((n) => `#${n}`).join(', ')}`).join(' · ')}`);
  } else {
    const p = readJson(f);
    if (!p) { console.log('No hay plan guardado (plan set "12,13 | 14").'); return; }
    process.stdout.write(planSummary(root, p));
  }
}
function planSummary(root, p) {
  const all = runs(root);
  const st = (n) => {
    const v = readJson(path.join(root, '.dev-flow', 'cards', `${n}.json`));
    const mine = all.filter((r) => r.issue === n);
    const audit = mine.find((r) => r.role === 'auditor' && r.result);
    if (audit) return `auditado: ${audit.result.verdict}`;
    if (mine.some((r) => r.state === 'corriendo')) return 'worker corriendo';
    if (v) return 'tarjeta recogida';
    return mine.length ? mine[0].state : 'sin lanzar';
  };
  const q = (p.queued || []).filter((n) => st(n) === 'sin lanzar');
  return [`Plan${p.goal ? `: ${p.goal}` : ''} (actualizado ${String(p.updated).slice(0, 16).replace('T', ' ')})`, ...p.waves.map((w, i) => `  ola ${i + 1}: ${w.map((n) => `#${n} ${st(n)}`).join(' · ')}`), ...(q.length ? [`  en cola por presupuesto: ${q.map((n) => `#${n}`).join(', ')}`] : [])].join('\n') + '\n';
}

// Próximo paso por ticket, calculado desde el registro de corridas, las tarjetas y veredictos recogidos y (si hay gh)
// los PRs. No lanza nada: imprime el comando exacto. Las paradas humanas no cambian (cada --launch pide confirmación,
// el merge lo decide una persona). Así ningún paso del ciclo depende de que alguien se acuerde de pedirlo.
function nextOf(root, n, ctx) {
  const all = ctx.all.filter((r) => r.issue === n);
  const impl = all.filter((r) => r.role !== 'auditor').sort((a, b) => b.at - a.at);
  const aud = all.filter((r) => r.role === 'auditor').sort((a, b) => b.at - a.at);
  const D = `node "${__filename}"`;
  const T = `node "${path.join(__dirname, '..', '..', 'ticket', 'scripts', 'ticket.cjs')}"`;
  const pr = ctx.prs.find((p) => new RegExp(`^(feat|fix|docs)/${n}-`).test(p.headRefName || '') || new RegExp(`\\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\\s+#${n}\\b`, 'i').test(p.body || ''));
  if (pr && (pr.state === 'MERGED' || pr.mergedAt)) return { n, state: 'mergeado', done: true };
  const cardF = path.join(root, '.dev-flow', 'cards', `${n}.json`);
  const collectedAt = (() => { try { return fs.statSync(cardF).mtimeMs; } catch { return 0; } })();
  const a = aud[0];
  if (a) {
    if (a.state === 'corriendo') return { n, state: 'auditor corriendo', wait: true, cmd: `${D} status` };
    const vF = path.join(root, '.dev-flow', 'verdicts', `${a.pr}.json`);
    if (a.result && !fs.existsSync(vF)) return { n, state: 'veredicto sin recoger', cmd: `${D} collect --run ${a.id}` };
    const v = a.result && a.result.verdict;
    const newer = impl[0] && impl[0].at > a.at;
    if (v === 'aprobar' && !newer) return { n, state: `aprobado (PR #${a.pr})`, human: true, cmd: `el merge del PR #${a.pr} lo decidís vos (checks en verde y veredicto a la vista)` };
    if (v === 'bloquear' && !newer) return { n, state: `bloqueado por el auditor (PR #${a.pr})`, human: true, cmd: `discutir los hallazgos P0 antes de seguir: .dev-flow/verdicts/${a.pr}.json` };
    if (v === 'cambios' && !newer) return { n, state: 'cambios pedidos por el auditor', cmd: `${D} run --issue ${n} --role implementer` };
    if (!a.result && !newer) return { n, state: `auditoría ${a.state}`, cmd: `${D} run --pr ${a.pr} --role auditor` };
  }
  const i = impl[0];
  if (!i) {
    const dep = ctx.waveDeps(n).find((d) => !ctx.done(d));
    if (dep) return { n, state: `espera a #${dep}`, wait: true };
    return { n, state: ctx.queued.includes(n) ? 'en cola por presupuesto' : 'sin lanzar', cmd: `${D} run --issue ${n} --role implementer`, note: 'primero el dry-run; con tamaño L, antes los explorers (paso 6)' };
  }
  if (i.state === 'corriendo') return { n, state: 'worker corriendo', wait: true, cmd: `${D} status` };
  if (!i.result) return { n, state: `worker ${i.state}`, cmd: `${D} resume --run ${i.id} --max-turns 40` };
  if (collectedAt < i.at) return { n, state: 'tarjeta sin recoger', cmd: `${D} collect --run ${i.id}` };
  if (!pr) {
    let wt = ''; try { wt = worktreeMod().plan(root, i.worktree).dest; } catch { /* sin worktree */ }
    return { n, state: 'tarjeta recogida, sin PR', cmd: `${wt ? `cd "${wt}" && ` : ''}${T} pr ${n} --card "${cardF}" --push` };
  }
  return { n, state: `PR #${pr.number} sin auditar`, cmd: `${D} run --pr ${pr.number} --role auditor` };
}

function next() {
  const root = dossier.mainRoot(process.cwd());
  const p = readJson(path.join(root, '.dev-flow', 'plan.json')) || { waves: [] };
  const all = runs(root);
  let prs = [], ghOk = true;
  try { prs = ghJson(['pr', 'list', '--state', 'all', '--limit', '200', '--json', 'number,headRefName,body,state,mergedAt']) || []; } catch { ghOk = false; }
  const waves = (p.waves || []).map((w) => w.map(Number));
  const tickets = get('--issue') ? [Number(get('--issue'))] : [...new Set([...waves.flat(), ...all.map((r) => r.issue).filter(Boolean)])];
  const ctx = { all, prs, queued: (p.queued || []).map(Number), waveDeps: (n) => { const k = waves.findIndex((w) => w.includes(n)); return k > 0 ? waves.slice(0, k).flat() : []; }, done: () => false };
  const memo = {};
  ctx.done = (n) => { if (!(n in memo)) { memo[n] = false; memo[n] = !!nextOf(root, n, ctx).done; } return memo[n]; };
  const rows = tickets.map((n) => nextOf(root, n, ctx));
  const closing = rows.length && rows.every((r) => r.done);
  const H = `node "${path.join(__dirname, 'harness.cjs')}"`;
  const close = closing ? `${`node "${path.join(__dirname, '..', '..', 'ticket', 'scripts', 'estado.cjs')}" --write`} && ${H} check --end && node "${path.join(__dirname, '..', '..', '..', 'hooks', 'worktree.cjs')}" gc --apply` : null;
  if (has('--json')) { console.log(JSON.stringify({ rows, close, gh: ghOk }, null, 2)); return; }
  if (!rows.length) { console.log('No hay tickets en el plan ni corridas. Empezá por: dispatch plan set "12,13 | 14" y ticket.cjs create <ID>.'); return; }
  for (const r of rows) console.log(`#${String(r.n).padEnd(5)} ${r.state}${r.cmd && !r.done ? `\n        → ${r.cmd}${r.note ? `  (${r.note})` : ''}` : ''}`);
  const first = rows.find((r) => r.cmd && !r.wait && !r.human && !r.done);
  if (close) console.log(`\nTodo mergeado. Cierre: ${close}`);
  else if (first) console.log(`\nSiguiente: ${first.cmd}`);
  if (!ghOk) console.log('(sin gh: no se miraron los PRs; "sin PR" puede estar desactualizado)');
}

// Memoria por rol: lecciones cortas, aprobadas por una persona o el Tech Lead, que se suman al system prompt del rol.
function memory() {
  const root = dossier.mainRoot(process.cwd());
  const dir = path.join(root, '.dev-flow', 'memory');
  const sub = argv[1];
  if (sub === 'add') {
    const role = get('--role');
    const text = argv.slice(2).filter((x, i, a) => x !== '--role' && a[i - 1] !== '--role').join(' ').trim();
    if (![...ROLES, 'explorer'].includes(role)) fail('memory add --role implementer|auditor|sre|docs|explorer "lección"');
    if (text.length < 15 || text.length > 300) fail('la lección tiene que tener entre 15 y 300 caracteres: concreta y verificable.');
    const f = path.join(dir, `${role}.md`);
    fs.mkdirSync(dir, { recursive: true });
    const cur = read(f) || `# Memoria del rol ${role}\n\nLecciones aprobadas para este repo. Se suman al system prompt del rol (máximo 40 líneas; condensá antes de agregar).\n\n`;
    if ((cur.match(/^\s*-\s+/gm) || []).length >= 40) fail(`${path.relative(root, f)} ya tiene 40 lecciones: condensá antes de agregar.`);
    fs.writeFileSync(f, `${cur.replace(/\s*$/, '\n')}- ${text} (${new Date().toISOString().slice(0, 10)})\n`);
    console.log(`Agregada a ${path.relative(root, f)}.`);
  } else if (sub === 'propose') {
    const ms = read(path.join(root, '.dev-flow', 'metrics.jsonl')).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const verdicts = fs.existsSync(path.join(root, '.dev-flow', 'verdicts')) ? fs.readdirSync(path.join(root, '.dev-flow', 'verdicts')).map((f) => readJson(path.join(root, '.dev-flow', 'verdicts', f))).filter(Boolean) : [];
    const byArea = {};
    for (const v of verdicts) for (const x of v.findings || []) if (x.severity !== 'P2') (byArea[x.area] = byArea[x.area] || []).push(`${x.issue} (${x.where})`);
    const den = {};
    for (const m of ms) for (const d of m.denials || []) den[d] = (den[d] || 0) + 1;
    const L = ['# Propuestas de memoria (no se aplican solas)', '', `Generado ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC a partir de veredictos y métricas. Aprobá con: dispatch memory add --role <rol> "<lección>"`, ''];
    const rep = Object.entries(byArea).filter(([, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length);
    if (rep.length) { L.push('## Para implementer (hallazgos que se repiten en las auditorías)', ''); for (const [area, l] of rep) L.push(`- [${area}] apareció ${l.length} veces. Ejemplos: ${l.slice(0, 2).join('; ')}`); L.push(''); }
    const dd = Object.entries(den).filter(([, n]) => n >= 2);
    if (dd.length) { L.push('## Para la configuración (permisos denegados repetidos → workers.allowedTools)', ''); for (const [d, n] of dd) L.push(`- ${d} denegado ${n} veces`); L.push(''); }
    if (!rep.length && !dd.length) L.push('Todavía no hay patrones repetidos (hacen falta al menos dos apariciones).');
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'proposals.md'), L.join('\n') + '\n');
    console.log(`Propuestas en ${path.relative(root, path.join(dir, 'proposals.md'))} (${rep.length} de hallazgos, ${dd.length} de permisos). Ninguna se aplica sin aprobación.`);
  } else {
    const roles = get('--role') ? [get('--role')] : [...ROLES, 'explorer'];
    for (const r of roles) { const m = memoryOf(root, r); console.log(`## ${r}\n${m || '(sin lecciones)'}\n`); }
  }
}

if (require.main === module) {
  try {
    if (cmd === 'run') run();
    else if (cmd === 'resume') resume();
    else if (cmd === 'status') status();
    else if (cmd === 'collect') collect();
    else if (cmd === 'stats') stats();
    else if (cmd === 'plan') plan();
    else if (cmd === 'memory') memory();
    else if (cmd === 'next') next();
    else { console.error('Uso: node dispatch.cjs run|resume|status|collect|stats|plan|memory|next (ver encabezado)'); process.exit(2); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { prompt, runs, claudeCmd, scopeOf, overlap, planSummary, nextOf };
