#!/usr/bin/env node
// El Tech Lead lanza workers efímeros: un rol, un ticket, contexto en frío, worktree propio y salida estructurada.
// Uso:
//   node dispatch.cjs run --issue <N> --role implementer|sre|docs [--mode headless|bg] [--launch]
//   node dispatch.cjs run --pr <P> --role auditor [--issue <N>] [--launch]
//   node dispatch.cjs status [--json]
//   node dispatch.cjs collect --run <id> [--comment]
// Sin --launch es un dry-run: muestra el plan, el prompt y el comando. Comparte topes y registro con feature-flow.
// headless: `claude -p` con la tarjeta (o el veredicto) validada por --json-schema; corre desacoplado y se sigue con status.
// bg: `claude --bg` (se ve en claude agents); el worker escribe la tarjeta en la carpeta de la corrida.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const config = require('../../../lib/config.cjs');
const guard = require('../../../lib/launch-guard.cjs');
const { ghJson, linkedIssue } = require('../../../lib/gh.cjs');
const card = require('./card.cjs');

const argv = process.argv.slice(2);
const cmd = argv[0];
const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k) => argv.includes(k);
const fail = (m) => { console.error('RECHAZADO: ' + m); process.exit(1); };
const PLUGIN = path.join(__dirname, '..', '..', '..');
const S = (rel) => path.join(PLUGIN, rel);
const ROLES = ['implementer', 'auditor', 'sre', 'docs'];

// Cómo invocar claude sin shell (el JSON del esquema no sobrevive a cmd.exe). AI_ENV_CLAUDE='["node","falso.cjs"]' en pruebas.
function claudeCmd() {
  if (process.env.AI_ENV_CLAUDE) { try { return JSON.parse(process.env.AI_ENV_CLAUDE); } catch { /* valor inválido */ } }
  if (process.platform !== 'win32') return ['claude'];
  const w = spawnSync('where', ['claude'], { encoding: 'utf8', windowsHide: true });
  const hits = (w.stdout || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const exe = hits.find((h) => /\.exe$/i.test(h));
  if (exe) return [exe];
  const shim = hits.find((h) => /\.cmd$/i.test(h));
  if (shim) {
    const js = path.join(path.dirname(shim), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (fs.existsSync(js)) return [process.execPath, js];
  }
  return ['claude'];
}

// Definición del rol (agents/<rol>.md): el cuerpo va como system prompt y el frontmatter da herramientas y modelo.
// No se usa --agent: en modo headless no resuelve agentes de plugin.
function roleDef(role) {
  const t = fs.readFileSync(S(`agents/${role}.md`), 'utf8').replace(/\r\n/g, '\n');
  const m = t.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const fm = m ? m[1] : '', body = (m ? m[2] : t).trim();
  const field = (k) => { const x = fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')); return x ? x[1].trim() : null; };
  const list = (k) => (field(k) || '').split(',').map((x) => x.trim()).filter(Boolean);
  return { body, model: field('model'), maxTurns: Number(field('maxTurns')) || null, disallowed: list('disallowedTools') };
}

function slugify(t) { return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^\[?[a-z]{1,4}-\d{1,4}\]?\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 4).join('-') || 'ticket'; }

function prompt({ role, issue, pr, runDir, base, modeHeadless, cardFile }) {
  const C = `node "${S('skills/dispatch/scripts/card.cjs')}"`;
  const scripts = role === 'auditor' ? [
    `- Auditoría determinista: node "${S('skills/audit/scripts/audit.cjs')}" --base ${base}`,
    `- Honestidad de pruebas: node "${S('skills/audit/scripts/test-honesty.cjs')}" --base ${base}`,
    cardFile ? `- Tarjeta del implementador: ${C} verify "${cardFile}" --base ${base} --run-tests` : '- No hay tarjeta del implementador guardada para este ticket: eso es un hallazgo de contrato.',
    `- Esquema del veredicto: ${card.schemaPath(true)}`,
  ] : [
    `- Honestidad de pruebas: node "${S('skills/audit/scripts/test-honesty.cjs')}" --base ${base}`,
    `- Validar la tarjeta: ${C} check <archivo>`,
    `- Esquema de la tarjeta: ${card.schemaPath(false)}`,
    ...(role === 'docs' ? [`- Estado del proyecto: node "${S('skills/ticket/scripts/estado.cjs')}" --write`, `- PRD: node "${S('skills/prd/scripts/prd.cjs')}" check`] : []),
    ...(has('--pr-after') ? [`- Abrir el PR: node "${S('skills/ticket/scripts/ticket.cjs')}" pr ${issue.number} --card "${path.join(runDir, 'card.json')}" --push`] : []),
  ];
  const out = role === 'auditor'
    ? 'Tu respuesta final es el JSON del veredicto (se valida con el esquema). No guardes archivos: no tenés permiso de escritura.'
    : modeHeadless
      ? `Tu respuesta final es el JSON de la tarjeta de entrega (se valida con el esquema). Guardá también una copia en ${path.join(runDir, 'card.json')}.`
      : `Al terminar, guardá la tarjeta de entrega en ${path.join(runDir, 'card.json')} y validala con card.cjs check.`;
  const L = [`Rol: ${role}. Rama base: ${base}.`];
  if (role === 'auditor') {
    L.push(`Auditá el PR #${pr.number}: ${pr.title}`, `${pr.url || ''}`, '', `Ticket enlazado: ${issue ? `#${issue.number} ${issue.title}` : 'ninguno (eso ya es un hallazgo de contrato)'}`);
    if (issue) L.push('', '## Ticket (alcance y criterios)', '', issue.body || '');
    L.push('', 'Estás en un worktree con la rama del PR. No edites archivos. No apruebes ni mergees.', 'No comentes en el PR: el Tech Lead publica tu veredicto.');
  } else {
    L.push(`Ticket #${issue.number}: ${issue.title}`, issue.url || '', '', '## Ticket', '', issue.body || '');
    L.push('', `Trabajás en tu propio worktree, en la rama del ticket. ${has('--pr-after') ? 'Al terminar, abrí el PR con ticket.cjs pr.' : 'No abras el PR: lo abre el Tech Lead con tu tarjeta.'}`);
  }
  L.push('', '## Scripts (rutas absolutas)', '', ...scripts, '', out, 'No abras otras sesiones ni subagentes. Si te bloqueás, decilo en la salida y terminá.');
  return L.join('\n') + '\n';
}

function run() {
  if (process.env.FEATURE_FLOW_CHILD) fail('esta sesión es un worker: no puede lanzar otros.');
  const role = get('--role');
  if (!ROLES.includes(role)) fail(`--role tiene que ser ${ROLES.join(', ')}.`);
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.status !== 0) fail('no estás dentro de un repo git.');
  const root = top.stdout.trim();
  const cfg = config.load(root);
  const W = cfg.workers || {};
  const mode = get('--mode') || W.mode || 'headless';
  if (!['headless', 'bg'].includes(mode)) fail('--mode es headless o bg.');
  const base = (spawnSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd: root, encoding: 'utf8' }).stdout || '').trim().replace(/^origin\//, '') || 'main';

  let issue = null, pr = null, name;
  try {
    if (role === 'auditor') {
      if (!/^\d+$/.test(get('--pr') || '')) fail('el auditor necesita --pr <número>.');
      pr = ghJson(['pr', 'view', get('--pr'), '--json', 'number,title,body,headRefName,baseRefName,url,state']);
      if (pr.state && pr.state !== 'OPEN') fail(`el PR #${pr.number} está ${pr.state}.`);
      const n = get('--issue') || linkedIssue(pr);
      if (n) issue = ghJson(['issue', 'view', String(n), '--json', 'number,title,body,labels,url,state']);
      // Rama de ticket → mismo worktree que el del implementador si sigue en esta máquina; si no, se trae del remoto.
      name = /^(feat|fix|docs|chore)\/\d+-/.test(pr.headRefName || '') ? pr.headRefName.replace('/', '-') : `pr-${pr.number}`;
    } else {
      if (!/^\d+$/.test(get('--issue') || '')) fail('falta --issue <número>.');
      issue = ghJson(['issue', 'view', get('--issue'), '--json', 'number,title,body,labels,url,state,assignees']);
      if (issue.state !== 'OPEN') fail(`#${issue.number} está ${issue.state}.`);
      if ((issue.labels || []).some((l) => l.name === cfg.labels.blocked)) fail(`#${issue.number} está bloqueado: resolvé la duda del issue antes de lanzar.`);
      const type = role === 'docs' ? 'docs' : (issue.labels || []).some((l) => l.name === 'tipo:fix') ? 'fix' : 'feat';
      name = `${type}-${issue.number}-${slugify(issue.title)}`;
    }
  } catch (e) { fail(e.message); }

  const key = `${role}-${role === 'auditor' ? `pr${pr.number}` : issue.number}`;
  const claude = claudeCmd();
  const c = guard.check(root, key, claude, { repeatHours: role === 'auditor' ? 1 : 24 });
  if (!c.ok) fail(c.msg);
  const b = guard.budget(root, key);
  if (!b.ok) fail(b.text);

  const id = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)}-${key}`;
  const runDir = path.join(root, '.dev-flow', 'runs', id);
  if (role === 'auditor' && mode !== 'headless') fail('el auditor corre solo en modo headless: no tiene permiso de escritura y su veredicto sale validado por esquema.');
  const cardFile = issue && fs.existsSync(path.join(root, '.dev-flow', 'cards', `${issue.number}.json`)) ? path.join(root, '.dev-flow', 'cards', `${issue.number}.json`) : null;
  const text = prompt({ role, issue, pr, runDir, base, modeHeadless: mode === 'headless', cardFile });
  // El hook de worktrees por settings: así `-w` también crea el worktree fuera del repo (el del plugin no alcanza al flag).
  const settings = { hooks: {
    WorktreeCreate: [{ hooks: [{ type: 'command', command: `node "${S('hooks/worktree.cjs').replace(/\\/g, '/')}" create`, timeout: 120 }] }],
    WorktreeRemove: [{ hooks: [{ type: 'command', command: `node "${S('hooks/worktree.cjs').replace(/\\/g, '/')}" remove`, timeout: 90 }] }],
  } };
  // El validador de Claude Code no resuelve el metaesquema 2020-12: se pasa el esquema sin "$schema".
  const schemaObj = JSON.parse(fs.readFileSync(card.schemaPath(role === 'auditor'), 'utf8'));
  delete schemaObj.$schema;
  const schema = JSON.stringify(schemaObj);
  const def = roleDef(role);
  // Reglas del proyecto para el rol (.claude/prompts/<rol>.md): se suman, no reemplazan.
  const own = path.join(root, '.claude', 'prompts', `${role}.md`);
  if (fs.existsSync(own)) { const t = fs.readFileSync(own, 'utf8').trim(); if (/^\s*-\s+\S/m.test(t)) def.body += `\n\n## Reglas del proyecto (.claude/prompts/${role}.md)\n\n${t}`; }
  const common = ['-w', name, '--settings', path.join(runDir, 'settings.json'), '--add-dir', runDir, '--append-system-prompt', def.body, ...(def.disallowed.length ? ['--disallowedTools', def.disallowed.join(',')] : []), ...(get('--model') || def.model ? ['--model', get('--model') || def.model] : [])];
  const perms = role === 'auditor'
    ? ['--permission-mode', 'default', '--allowedTools', ['Read', 'Glob', 'Grep', 'Bash(git *)', 'Bash(gh pr *)', 'Bash(gh issue view *)', 'Bash(node *)', 'Bash(npm test*)', 'Bash(npm run *)', 'Bash(pnpm *)', 'Bash(npx *)', 'PowerShell'].join(',')]
    : ['--permission-mode', W.permissionMode || 'auto', '--allowedTools', (W.allowedTools || []).join(',')];
  const args = mode === 'headless'
    ? ['-p', ...common, ...perms, '--output-format', 'json', '--json-schema', schema, '--max-turns', String(get('--max-turns') || W.maxTurns || def.maxTurns || 80)]
    : ['--bg', ...common, ...perms, '-n', name, `Leé tus instrucciones en ${path.join(runDir, 'prompt.md')} y seguilas.`];

  console.log(`Worker: ${role} ${role === 'auditor' ? `PR #${pr.number}` : `#${issue.number}`} (${mode})`);
  console.log(`Worktree: ${name}  ·  corrida ${id}`);
  console.log(`Cupos: ${c.info.running.total}/${c.info.maxConcurrent} en segundo plano, ${c.info.today}/${c.info.maxPerDay} lanzadas en 24 h, espera mínima ${c.info.cooldown} min.`);
  console.log(b.text);
  console.log(`Comando: ${[...claude, ...args.map((a) => (a.length > 80 ? a.slice(0, 60) + '…' : a))].join(' ')}`);
  console.log(`\n--- prompt (${text.length} caracteres) ---\n${text.slice(0, 1500)}${text.length > 1500 ? '\n[…]' : ''}`);
  if (!has('--launch')) { console.log('\nDry-run: no se lanzó nada. Agregá --launch para lanzar.'); return; }

  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'prompt.md'), text);
  fs.writeFileSync(path.join(runDir, 'settings.json'), JSON.stringify(settings, null, 2));
  const env = { ...process.env, FEATURE_FLOW_CHILD: '1', DEV_FLOW_ROLE: role, DEV_FLOW_RUN: id, ...(issue ? { DEV_FLOW_TICKET: String(issue.number) } : {}) };
  const [exe, ...pre] = claude;
  const meta = { id, role, mode, key, kind: 'worker', issue: issue ? issue.number : null, pr: pr ? pr.number : null, worktree: name, runDir, at: Date.now() };
  if (mode === 'headless') {
    const out = fs.openSync(path.join(runDir, 'out.json'), 'w'), errf = fs.openSync(path.join(runDir, 'err.log'), 'w');
    const inp = fs.openSync(path.join(runDir, 'prompt.md'), 'r');
    const child = spawn(exe, [...pre, ...args], { cwd: root, env, detached: true, stdio: [inp, out, errf], windowsHide: true });
    child.on('error', (e) => { fs.appendFileSync(path.join(runDir, 'err.log'), `spawn: ${e.message}\n`); });
    child.unref();
    meta.pid = child.pid;
  } else {
    const r = spawnSync(exe, [...pre, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) fail(`claude devolvió error: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`);
    meta.session = (r.stdout || '').trim().split(/\s+/).pop();
  }
  fs.writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify(meta, null, 2));
  guard.record(root, { key, kind: 'worker', mode, pid: meta.pid, run: id });
  console.log(`\nLanzado. Seguilo con: node "${__filename}" status`);
}

function runs(root) {
  const dir = path.join(root, '.dev-flow', 'runs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().reverse().map((id) => {
    const d = path.join(dir, id);
    let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8')); } catch { return null; }
    const verdict = meta.role === 'auditor';
    const r = { ...meta, state: 'corriendo', result: null, errors: [] };
    const outF = path.join(d, 'out.json'), fileF = path.join(d, verdict ? 'verdict.json' : 'card.json');
    let raw = '';
    try { raw = fs.readFileSync(outF, 'utf8').trim(); } catch { /* bg */ }
    if (meta.mode === 'headless' && raw) {
      r.state = 'terminado';
      try { const j = JSON.parse(raw); r.cost = j.total_cost_usd; r.turns = j.num_turns; if (j.is_error || /error/.test(j.subtype || '')) r.state = `error (${j.subtype || 'is_error'})`; } catch { /* no es JSON */ }
      try { r.result = card.extract(raw); } catch (e) { r.errors.push(e.message); }
    }
    if (!r.result && fs.existsSync(fileF)) { try { r.result = JSON.parse(fs.readFileSync(fileF, 'utf8')); r.state = 'terminado'; } catch (e) { r.errors.push(`${path.basename(fileF)}: ${e.message}`); } }
    if (meta.mode === 'headless' && !raw && !guard.alive(meta.pid)) { r.state = 'terminó sin salida'; try { r.errors.push(fs.readFileSync(path.join(d, 'err.log'), 'utf8').trim().split('\n').slice(-3).join(' | ')); } catch { /* sin log */ } }
    if (r.result) r.errors.push(...card.validate(r.result, verdict));
    return r;
  }).filter(Boolean);
}

function status() {
  const root = config.repoRoot(process.cwd());
  const list = runs(root).filter((r) => Date.now() - r.at < 3 * 86400000);
  if (has('--json')) { console.log(JSON.stringify(list, null, 2)); return; }
  if (!list.length) { console.log('No hay corridas de workers en los últimos 3 días.'); return; }
  for (const r of list) {
    const what = r.role === 'auditor' ? `PR #${r.pr}` : `#${r.issue}`;
    const res = r.result ? (r.role === 'auditor' ? `veredicto ${String(r.result.verdict || '?').toUpperCase()}` : `tarjeta: ${(r.result.acceptance || []).filter((a) => a.status === 'cumple').length}/${(r.result.acceptance || []).length} criterios, pruebas ${r.result.tests && r.result.tests.passed ? 'pasan' : 'NO pasan'}, sin el cambio fallan: ${r.result.tests ? r.result.tests.fail_without_change : '?'}`) : '';
    console.log(`${r.id}  ${r.role.padEnd(11)} ${what.padEnd(7)} ${r.state}${res ? ` — ${res}` : ''}${r.cost ? ` · US$ ${r.cost.toFixed(2)}` : ''}`);
    for (const e of r.errors.filter(Boolean)) console.log(`    ! ${e}`);
  }
}

function collect() {
  const root = config.repoRoot(process.cwd());
  const r = runs(root).find((x) => x.id === get('--run'));
  if (!r) fail(`no encuentro la corrida ${get('--run')} (mirá status).`);
  if (!r.result) fail(`la corrida ${r.id} todavía no tiene ${r.role === 'auditor' ? 'veredicto' : 'tarjeta'} (${r.state}).`);
  const verdict = r.role === 'auditor';
  const errs = card.validate(r.result, verdict);
  if (errs.length) fail(`${verdict ? 'veredicto' : 'tarjeta'} inválida:\n- ${errs.join('\n- ')}`);
  const dest = path.join(root, '.dev-flow', verdict ? 'verdicts' : 'cards', `${verdict ? r.pr : r.issue}.json`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(r.result, null, 2) + '\n');
  const md = card.render(r.result, verdict);
  console.log(`Guardado en ${path.relative(root, dest)}\n\n${md}`);
  if (has('--comment')) {
    const f = path.join(r.runDir, 'comment.md'); fs.writeFileSync(f, md);
    const { gh } = require('../../../lib/gh.cjs');
    gh(verdict ? ['pr', 'comment', String(r.pr), '--body-file', f] : ['issue', 'comment', String(r.issue), '--body-file', f]);
    console.log(`Comentado en ${verdict ? `el PR #${r.pr}` : `el issue #${r.issue}`}.`);
  }
}

if (require.main === module) {
  try {
    if (cmd === 'run') run();
    else if (cmd === 'status') status();
    else if (cmd === 'collect') collect();
    else { console.error('Uso: node dispatch.cjs run --issue N --role implementer|sre|docs | run --pr P --role auditor | status | collect --run <id>'); process.exit(2); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { prompt, runs, claudeCmd };
