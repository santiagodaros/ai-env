#!/usr/bin/env node
// Verificación del arnés: el equivalente de init.sh, en Node (Windows, macOS, Linux).
// Uso:
//   node harness.cjs check --pre      antes de lanzar workers (lo corre dispatch): config, PRD, rama base en verde, huérfanos
//   node harness.cjs check --worker   lo primero que hace un worker en su worktree: si las pruebas ya fallan, no arranca
//   node harness.cjs check --end      checkpoints del estado final: coherencia, cierre trazable, estado (docs/STATE.md) al día, limpieza
// Opciones: --json, --no-tests (no corre pruebas locales), --base <rama>.
// "Se evalúa el destino, no el camino": cada checkpoint es objetivo y se puede repetir. Sale con 1 si algo FALLA.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../../../lib/config.cjs');
const { gh } = require('../../../lib/gh.cjs');
const prd = require('../../prd/scripts/prd.cjs');
const { testCommand } = require('../../audit/scripts/test-honesty.cjs');
const guard = require('../../../lib/launch-guard.cjs');

const argv = process.argv.slice(2);
const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k) => argv.includes(k);
const rows = [];
const add = (id, res, name, detail = '') => rows.push({ id, res, name, detail });
const git = (cwd, a) => spawnSync('git', a, { cwd, encoding: 'utf8' });

function mainRoot(cwd) {
  const r = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (r.status === 0) { const c = r.stdout.trim(); if (path.basename(c) === '.git') return path.dirname(c); }
  return config.repoRoot(cwd);
}
function baseBranch(root) {
  if (get('--base')) return get('--base');
  const s = git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  return s.status === 0 ? s.stdout.trim().replace(/^origin\//, '') : 'main';
}
function ghJsonSafe(args) {
  try { const r = gh(args, { allowFail: true, timeout: 30000 }); if (r.code !== 0) return null; return JSON.parse(r.out || 'null'); } catch { return null; }
}
function runTests(cwd, cfg) {
  const cmd = testCommand(cwd, cfg);
  if (!cmd) return { skipped: 'sin comando de pruebas' };
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', timeout: 15 * 60000, env: { ...process.env, CI: '1' } });
  return { cmd, ok: r.status === 0, tail: `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-3).join(' | ').slice(0, 300) };
}

function checkConfigAndPrd(root, cfg) {
  const cf = path.join(root, '.claude', 'dev-flow.json');
  if (fs.existsSync(cf)) { try { JSON.parse(fs.readFileSync(cf, 'utf8')); add('C1', 'OK', 'configuración válida', '.claude/dev-flow.json'); } catch (e) { add('C1', 'FALLA', 'configuración inválida', `.claude/dev-flow.json: ${e.message}`); } }
  else add('C1', 'AVISO', 'sin .claude/dev-flow.json', 'se usan los valores por defecto (/dev-flow:init en modo Tech Lead lo crea)');
  if (fs.existsSync(path.join(root, cfg.prd))) {
    const r = prd.check(root, cfg.prd);
    add('C1', r.errors.length ? 'FALLA' : 'OK', 'PRD sin ids repetidos ni citas rotas', r.errors.length ? r.errors.slice(0, 3).join('; ') : `${r.sections} secciones${r.warnings.length ? `; ${r.warnings.length} aviso(s)` : ''}`);
  } else add('C1', 'AVISO', `no existe ${cfg.prd}`, 'prd.cjs init crea el esqueleto');
}

function pre(root, cfg) {
  checkConfigAndPrd(root, cfg);
  const base = baseBranch(root);
  const runs = ghJsonSafe(['run', 'list', '--branch', base, '--limit', '5', '--json', 'conclusion,status,name,headSha']);
  const done = Array.isArray(runs) ? runs.filter((r) => r.status === 'completed') : [];
  if (done.length) {
    const red = done.filter((r) => r.headSha === done[0].headSha && ['failure', 'timed_out', 'cancelled', 'startup_failure'].includes(r.conclusion));
    add('C2', red.length ? 'FALLA' : 'OK', `${base} en verde en CI`, red.length ? `${red.map((r) => r.name).join(', ')}: ${red[0].conclusion}. No se lanzan workers sobre una base rota.` : `último commit (${String(done[0].headSha).slice(0, 7)})`);
  } else if (!has('--no-tests') && git(root, ['branch', '--show-current']).stdout.trim() === base && !git(root, ['status', '--porcelain', '--untracked-files=no']).stdout.trim()) {
    const t = runTests(root, cfg);
    if (t.skipped) add('C2', 'AVISO', `${base} sin verificar`, t.skipped);
    else add('C2', t.ok ? 'OK' : 'FALLA', `${base} en verde (pruebas locales)`, t.ok ? t.cmd : `${t.cmd}: ${t.tail}`);
  } else add('C2', 'AVISO', `${base} sin verificar`, 'sin CI visible con gh y el checkout no está limpio en la rama base');
  const wt = git(root, ['worktree', 'list', '--porcelain']).stdout;
  const prunable = (wt.match(/^prunable/gm) || []).length;
  if (prunable) add('C5', 'AVISO', `${prunable} worktree(s) huérfanos`, 'git worktree prune o worktree.cjs gc');
  const reg = guard.readReg(root);
  const zombies = reg.filter((r) => r.mode === 'headless' && r.pid && Date.now() - r.at < 86400000 && !guard.alive(r.pid) && r.run && !fs.existsSync(path.join(root, '.dev-flow', 'runs', r.run, 'out.json')));
  if (zombies.length) add('C5', 'AVISO', `${zombies.length} corrida(s) terminaron sin salida`, 'dispatch status / dispatch resume');
}

function worker(cwd, cfg) {
  const br = git(cwd, ['branch', '--show-current']).stdout.trim();
  add('W1', /^(feat|fix|docs|chore)\/\d+-/.test(br) ? 'OK' : 'AVISO', 'rama de ticket', br || '(HEAD separado)');
  try {
    const s = require('./dossier.cjs').seed(cwd);
    if (s) add('W3', 'OK', 'progreso del ticket en el worktree', `${path.relative(cwd, s.file)}${s.seeded ? ' (creado desde el expediente)' : ''}`);
  } catch (e) { add('W3', 'AVISO', 'no pude preparar .dev-flow/ticket/progress.md', e.message); }
  if (has('--no-tests')) return;
  const t = runTests(cwd, cfg);
  if (t.skipped) add('W2', 'AVISO', 'pruebas de base sin correr', t.skipped);
  else add('W2', t.ok ? 'OK' : 'FALLA', 'las pruebas pasan antes de empezar', t.ok ? t.cmd : `${t.cmd}: ${t.tail}. No arranques: comentalo en el issue y terminá con la tarjeta.`);
}

function end(root, cfg) {
  checkConfigAndPrd(root, cfg);
  const L = cfg.labels;
  const st = path.join(root, cfg.state);
  if (fs.existsSync(st)) {
    const m = fs.readFileSync(st, 'utf8').match(/_Generado (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) UTC/);
    const age = m ? (Date.now() - Date.parse(m[1].replace(' ', 'T') + ':00Z')) / 3600000 : null;
    add('C4', age !== null && age < 24 ? 'OK' : 'AVISO', `${cfg.state} al día`, age === null ? 'nunca se generó: estado.cjs --write' : `generado hace ${Math.round(age)} h`);
  } else add('C4', 'AVISO', `no existe ${cfg.state}`, 'estado.cjs --write');
  const issues = ghJsonSafe(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,labels,updatedAt']);
  if (Array.isArray(issues)) {
    const lab = (i) => (i.labels || []).map((x) => x.name);
    const doing = issues.filter((i) => lab(i).includes(L.doing));
    const max = guard.limits(root).maxConcurrent;
    add('C2', doing.length <= Math.max(max, 1) ? 'OK' : 'AVISO', `tickets en curso dentro del tope (${max})`, `${doing.length} en curso`);
    const stale = doing.filter((i) => i.updatedAt && Date.now() - Date.parse(i.updatedAt) > 48 * 3600000);
    if (stale.length) add('C2', 'AVISO', `${stale.length} ticket(s) "en curso" sin movimiento en 48 h`, stale.map((i) => `#${i.number}`).join(', '));
  } else add('C2', 'AVISO', 'estado de GitHub sin verificar', 'gh no disponible');
  const merged = ghJsonSafe(['pr', 'list', '--state', 'merged', '--limit', '30', '--json', 'number,body,mergedAt,headRefName']);
  if (Array.isArray(merged)) {
    const recent = merged.filter((p) => p.mergedAt && Date.now() - Date.parse(p.mergedAt) < 30 * 86400000 && /^(feat|fix|docs|chore)\/\d+-/.test(p.headRefName || ''));
    const noCard = recent.filter((p) => !/## Tarjeta de entrega/.test(p.body || ''));
    const noVerdict = recent.filter((p) => !fs.existsSync(path.join(root, '.dev-flow', 'verdicts', `${p.number}.json`)));
    add('C3', noCard.length ? 'AVISO' : 'OK', 'PRs de tickets mergeados con tarjeta de entrega', noCard.length ? noCard.map((p) => `#${p.number}`).join(', ') : `${recent.length} PR(s) en 30 días`);
    add('C3', noVerdict.length ? 'AVISO' : 'OK', 'PRs de tickets mergeados con veredicto del auditor', noVerdict.length ? `${noVerdict.map((p) => `#${p.number}`).join(', ')} (sin .dev-flow/verdicts/<PR>.json en esta máquina)` : `${recent.length} PR(s)`);
  }
  const gc = spawnSync(process.execPath, [path.join(__dirname, '..', '..', '..', 'hooks', 'worktree.cjs'), 'gc', '--dir', root], { encoding: 'utf8' });
  const toDelete = (gc.stdout || '').split('\n').filter((l) => /^borrar\s/.test(l)).length;
  add('C5', toDelete ? 'AVISO' : 'OK', 'sin worktrees de tickets ya mergeados', toDelete ? `${toDelete} para borrar: worktree.cjs gc --apply` : '');
}

if (require.main === module) {
  if (argv[0] !== 'check' || !['--pre', '--worker', '--end'].some(has)) { console.error('Uso: node harness.cjs check --pre|--worker|--end [--json] [--no-tests] [--base main]'); process.exit(2); }
  const cwd = process.cwd();
  const root = has('--worker') ? cwd : mainRoot(cwd);
  const cfg = config.load(mainRoot(cwd));
  try {
    if (has('--pre')) pre(root, cfg);
    if (has('--worker')) worker(cwd, cfg);
    if (has('--end')) end(root, cfg);
  } catch (e) { add('X', 'FALLA', 'error interno del chequeo', e.message); }
  const fails = rows.filter((r) => r.res === 'FALLA').length;
  if (has('--json')) console.log(JSON.stringify({ ok: !fails, rows }, null, 2));
  else {
    for (const r of rows) console.log(`${r.res.padEnd(6)} ${r.id.padEnd(3)} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    console.log(fails ? `\n${fails} chequeo(s) fallan.` : '\nArnés en condiciones.');
  }
  process.exit(fails ? 1 : 0);
}
