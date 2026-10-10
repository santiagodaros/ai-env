#!/usr/bin/env node
// Expediente por ticket: el hilo de lo que se hizo, para que cada worker lea un resumen y no el código entero.
//   .dev-flow/tickets/<N>/
//     brief.md            la rebanada del PRD (lo que recibe todo worker)
//     progress.md         plan, hecho, decisiones, siguiente paso. El worker lo escribe MIENTRAS trabaja en
//                         <worktree>/.dev-flow/ticket/progress.md y pull() lo copia acá (ver WORK)
//     log.md              una entrada por corrida, solo se agrega (lo escribe este script, no el modelo)
//     impl-<k>.md, audit-<k>.md, sre-<k>.md, docs-<k>.md   informe de cada corrida (desde la tarjeta o el veredicto)
//     explore-<tema>.md   hallazgos de exploradores
//     index.md            resumen de ~40 líneas, generado de forma determinista
// Uso:
//   node dossier.cjs init <N> --title "..." --brief-file <archivo>
//   node dossier.cjs record <N> --run-dir <carpeta de la corrida>     (agrega al log y escribe el informe)
//   node dossier.cjs index <N> [--print]
//   node dossier.cjs summary <N> --out docs/tickets/<N>.md             (resumen versionable para el PR)
//   node dossier.cjs path <N>
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../../../lib/config.cjs');

const PROGRESS_TEMPLATE = (n, title) => `# Progreso del ticket #${n}${title ? `: ${title}` : ''}

> Lo escribe el worker activo mientras trabaja, no al final. Si la corrida se corta, la siguiente arranca de acá.

## Plan
-

## Hecho
-

## Decisiones (con motivo)
-

## Siguiente paso
-
`;

// Raíz del repo principal aunque se llame desde un worktree.
function mainRoot(cwd) {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8' });
  if (r.status === 0) { const c = r.stdout.trim(); if (path.basename(c) === '.git') return path.dirname(c); }
  return config.repoRoot(cwd);
}
const dir = (root, n) => path.join(root, '.dev-flow', 'tickets', String(n));
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const PREFIX = { implementer: 'impl', auditor: 'audit', sre: 'sre', docs: 'docs', explorer: 'explore' };

// Copia de trabajo del worker DENTRO de su worktree (ignorada por git). Claude Code aísla las sesiones con -w:
// rechaza Write y redirecciones a rutas del checkout principal, así que el worker no escribe el expediente directo.
// harness check --worker siembra la copia; pull() la trae al expediente cada vez que el Tech Lead lo mira.
const WORK = path.join('.dev-flow', 'ticket');
const TICKET_BRANCH = /^(?:feat|fix|docs|chore)\/(\d+)-/;

function worktrees(root) {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) return [];
  return r.stdout.split(/\n\n+/).map((b) => ({ path: (b.match(/^worktree (.+)$/m) || [])[1], branch: ((b.match(/^branch refs\/heads\/(.+)$/m) || [])[1]) || '' })).filter((w) => w.path);
}

// Trae progress.md de los worktrees del ticket al expediente, si es más nuevo.
function pull(root, n) {
  const dst = path.join(dir(root, n), 'progress.md');
  for (const w of worktrees(root)) {
    const m = w.branch.match(TICKET_BRANCH);
    if (!m || m[1] !== String(n)) continue;
    const src = path.join(w.path, WORK, 'progress.md');
    try {
      if (!fs.existsSync(dst) || fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
    } catch { /* ese worktree no tiene copia de trabajo */ }
  }
}

// En el worktree del worker: crea .dev-flow/ticket/progress.md desde el expediente (o la plantilla) si falta.
function seed(cwd) {
  const br = spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }).stdout.trim();
  const m = br.match(TICKET_BRANCH);
  if (!m) return null;
  const f = path.join(cwd, WORK, 'progress.md');
  if (fs.existsSync(f)) return { file: f, seeded: false };
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const prev = read(path.join(dir(mainRoot(cwd), m[1]), 'progress.md'));
  fs.writeFileSync(f, prev || PROGRESS_TEMPLATE(m[1]));
  return { file: f, seeded: true };
}

function init(root, n, { title = '', brief = '' } = {}) {
  const d = dir(root, n);
  fs.mkdirSync(d, { recursive: true });
  if (brief && !fs.existsSync(path.join(d, 'brief.md'))) fs.writeFileSync(path.join(d, 'brief.md'), `# Ticket #${n}${title ? `: ${title}` : ''}\n\n${brief.trim()}\n`);
  if (!fs.existsSync(path.join(d, 'progress.md'))) fs.writeFileSync(path.join(d, 'progress.md'), PROGRESS_TEMPLATE(n, title));
  if (!fs.existsSync(path.join(d, 'log.md'))) fs.writeFileSync(path.join(d, 'log.md'), `# Log del ticket #${n}\n\nUna entrada por corrida. Solo se agrega; no se editan entradas anteriores.\n`);
  return d;
}

// Sección de un markdown por título (## Título) hasta la siguiente ##.
function section(md, re) {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => /^##\s/.test(l) && re.test(l));
  if (i < 0) return '';
  const j = lines.slice(i + 1).findIndex((l) => /^##\s/.test(l));
  return lines.slice(i + 1, j < 0 ? undefined : i + 1 + j).join('\n').trim();
}
const meaningful = (txt) => txt.split('\n').map((l) => l.trim()).filter((l) => l && l !== '-' && !/^>/.test(l));

function record(root, n, runDir) {
  const card = require('./card.cjs');
  const meta = readJson(path.join(runDir, 'meta.json')) || {};
  const d = init(root, n);
  const verdict = meta.role === 'auditor';
  let result = readJson(path.join(runDir, verdict ? 'verdict.json' : 'card.json'));
  const raw = read(path.join(runDir, 'out.json'));
  let out = null; try { out = JSON.parse(raw); } catch { /* sin salida */ }
  if (!result && raw) { try { result = card.extract(raw); } catch { /* sin tarjeta */ } }
  const log = read(path.join(d, 'log.md'));
  if (meta.id && log.includes(`<!-- run:${meta.id} -->`)) return { skipped: true, dir: d };
  const prefix = PREFIX[meta.role] || meta.role || 'run';
  const k = fs.readdirSync(d).filter((f) => new RegExp(`^${prefix}-\\d+\\.md$`).test(f)).length + 1;
  const report = `${prefix}-${k}.md`;
  if (result) fs.writeFileSync(path.join(d, report), `<!-- run:${meta.id} -->\n` + card.render(result, verdict));
  const when = new Date(meta.at || Date.now()).toISOString().slice(0, 16).replace('T', ' ');
  const lines = [`\n## ${when} — ${meta.role || '?'} (${meta.id || 'sin id'}) <!-- run:${meta.id} -->`];
  if (!result) lines.push(`- Sin ${verdict ? 'veredicto' : 'tarjeta'}: ${out && out.subtype ? out.subtype : 'la corrida no terminó'}. Retomar con dispatch resume --run ${meta.id}.`);
  else if (verdict) {
    lines.push(`- Veredicto: **${result.verdict}**. ${result.summary}`);
    for (const f of (result.findings || []).filter((x) => x.severity !== 'P2')) lines.push(`- ${f.severity} [${f.area}] ${f.where}: ${f.issue} → ${f.fix}`);
  } else {
    lines.push(`- ${result.summary}`);
    lines.push(`- Pruebas: ${result.tests.passed ? 'pasan' : 'NO pasan'}; sin el cambio fallan: ${result.tests.fail_without_change}. Criterios: ${result.acceptance.filter((a) => a.status === 'cumple').length}/${result.acceptance.length}.`);
    lines.push(`- Archivos: ${result.files_changed.join(', ')}`);
    for (const x of result.decisions || []) lines.push(`- Decisión: ${x.decision} (${x.reason})`);
  }
  if (out && out.total_cost_usd !== undefined) lines.push(`- Costo US$ ${Number(out.total_cost_usd).toFixed(2)}, ${out.num_turns || '?'} turnos.`);
  if (result) lines.push(`- Informe: ${report}`);
  fs.appendFileSync(path.join(d, 'log.md'), lines.join('\n') + '\n');
  index(root, n);
  return { dir: d, report: result ? report : null };
}

function index(root, n) {
  const d = dir(root, n);
  if (!fs.existsSync(d)) return '';
  pull(root, n);
  const brief = read(path.join(d, 'brief.md'));
  const title = (brief.match(/^# (.+)$/m) || [])[1] || `Ticket #${n}`;
  const files = fs.readdirSync(d);
  const reports = files.filter((f) => /^(impl|audit|sre|docs)-\d+\.md$/.test(f)).sort((a, b) => fs.statSync(path.join(d, a)).mtimeMs - fs.statSync(path.join(d, b)).mtimeMs);
  const audits = reports.filter((f) => f.startsWith('audit-'));
  const impls = reports.filter((f) => !f.startsWith('audit-'));
  const lastAudit = audits.length ? read(path.join(d, audits[audits.length - 1])) : '';
  const lastImpl = impls.length ? read(path.join(d, impls[impls.length - 1])) : '';
  const progress = read(path.join(d, 'progress.md'));
  const verdictLine = (lastAudit.match(/### Auditoría: \*\*(\w+)\*\*/) || [])[1];
  const estado = verdictLine ? `auditado: ${verdictLine.toLowerCase()}` : impls.length ? 'implementado, sin auditar' : 'sin corridas';
  const L = [`# ${title}`, '', `Estado: **${estado}** · corridas: ${impls.length} de trabajo, ${audits.length} de auditoría · generado ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, ''];
  const crit = section(brief, /criterios de aceptaci/i);
  if (crit) L.push('## Criterios', crit.split('\n').slice(0, 8).join('\n'), '');
  const decisions = [...read(path.join(d, 'log.md')).matchAll(/^- Decisión: (.+)$/gm)].map((m) => `- ${m[1]}`);
  const progDec = meaningful(section(progress, /decisiones/i)).map((l) => (l.startsWith('-') ? l : `- ${l}`));
  const allDec = [...new Set([...decisions, ...progDec])];
  if (allDec.length) L.push('## Decisiones', ...allDec.slice(-8), '');
  if (lastImpl) {
    const filesLine = (lastImpl.match(/### Archivos\n\n([\s\S]*?)(\n###|\s*$)/) || [])[1];
    if (filesLine) L.push('## Archivos tocados', ...filesLine.trim().split('\n').slice(0, 10), '');
  }
  if (lastAudit) {
    const rows = lastAudit.split('\n').filter((l) => /^\| P[01] \|/.test(l));
    if (rows.length) L.push(`## Hallazgos abiertos del último auditor (${audits[audits.length - 1]})`, ...rows.slice(0, 8).map((r) => { const c = r.split('|').map((x) => x.trim()); return `- ${c[1]} [${c[2]}] ${c[3]}: ${c[4]} → ${c[5]}`; }), '');
  }
  const pend = [...lastImpl.matchAll(/^### (?:Puntos ciegos.*|Pendientes.*)\n\n((?:- .*\n?)+)/gm)].flatMap((m) => m[1].trim().split('\n'));
  if (pend.length) L.push('## Sin verificar o pendiente', ...pend.slice(0, 6), '');
  const next = meaningful(section(progress, /siguiente paso/i));
  if (next.length) L.push('## Siguiente paso (de progress.md)', ...next.slice(0, 3).map((l) => (l.startsWith('-') ? l : `- ${l}`)), '');
  L.push('## Archivos del expediente', `- brief.md, progress.md, log.md${reports.length ? `, ${reports.join(', ')}` : ''}${files.filter((f) => f.startsWith('explore-')).map((f) => `, ${f}`).join('')}`);
  const text = L.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  fs.writeFileSync(path.join(d, 'index.md'), text);
  return text;
}

// Resumen versionable (va al PR): el "por qué" sobrevive en git sin subir los borradores.
function summary(root, n) {
  const d = dir(root, n);
  if (!fs.existsSync(d)) throw new Error(`No hay expediente para #${n} (${path.relative(root, d)}).`);
  const idx = index(root, n);
  const log = read(path.join(d, 'log.md'));
  const runs = [...log.matchAll(/^## (.+?) <!-- run:/gm)].map((m) => `- ${m[1]}`);
  return [`<!-- Generado por dev-flow (dossier.cjs summary). El expediente completo queda local en .dev-flow/tickets/${n}/. -->`, idx.replace(/^## Archivos del expediente[\s\S]*$/m, '').replace(/^## Siguiente paso[\s\S]*?(?=^## |\s*$)/m, '').trim(), '', '## Corridas', ...runs, ''].join('\n').replace(/\n{3,}/g, '\n\n');
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const [cmd, n] = argv;
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const root = mainRoot(process.cwd());
  try {
    if (!/^\d+$/.test(n || '')) throw new Error('Uso: node dossier.cjs init|record|index|summary|path <N> [...]');
    if (cmd === 'init') console.log(init(root, n, { title: get('--title') || '', brief: get('--brief-file') ? read(get('--brief-file')) : '' }));
    else if (cmd === 'record') { const r = record(root, n, path.resolve(get('--run-dir') || '')); console.log(r.skipped ? 'Ya estaba registrada.' : `Registrada en ${path.relative(root, r.dir)}${r.report ? ` (${r.report})` : ''}.`); }
    else if (cmd === 'index') { const t = index(root, n); if (argv.includes('--print')) process.stdout.write(t); else console.log(`Índice actualizado: ${path.relative(root, path.join(dir(root, n), 'index.md'))}`); }
    else if (cmd === 'summary') { const t = summary(root, n); const out = get('--out'); if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, t); console.log(`Escrito ${out}`); } else process.stdout.write(t); }
    else if (cmd === 'path') console.log(dir(root, n));
    else throw new Error(`Comando desconocido: ${cmd}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { init, record, index, summary, dir, mainRoot, pull, seed, worktrees, WORK, PROGRESS_TEMPLATE };
