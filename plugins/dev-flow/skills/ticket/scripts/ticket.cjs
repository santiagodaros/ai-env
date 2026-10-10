#!/usr/bin/env node
// Tickets en GitHub Issues a partir del PRD. El issue es el contexto completo del worker: la rebanada del PRD,
// los criterios de aceptación y el contrato de entrega. Usa el GitHub CLI (gh) ya autenticado.
// Uso:
//   node ticket.cjs labels                                   crea las etiquetas de estado (idempotente)
//   node ticket.cjs create <PRD-ID> [--type feat|fix] [--title "..."] [--dry-run] [--force]
//   node ticket.cjs claim <N> [--develop]                    se lo asigna, lo pasa a "en curso", dice la rama
//   node ticket.cjs context <N> [--out archivo.md]           imprime el issue (lo que recibe el worker)
//   node ticket.cjs pr <N> [--card tarjeta.json] [--base main] [--draft] [--push] [--dry-run]
//   node ticket.cjs status [--json]                          tablero: issues en curso y PRs con checks
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../../../lib/config.cjs');
const { gh, ghJson, linkedIssue, checksState } = require('../../../lib/gh.cjs');
const prd = require('../../prd/scripts/prd.cjs');

const argv = process.argv.slice(2);
const cmd = argv[0];
const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k) => argv.includes(k);
const root = config.repoRoot(get('--dir') || process.cwd());
const cfg = config.load(root);
const L = cfg.labels;
const git = (a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' });
const slugify = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^\[?[a-z]{1,4}-\d{1,4}\]?\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 5).join('-') || 'ticket';
const tmpFile = (name, text) => { const f = path.join(os.tmpdir(), `dev-flow-${process.pid}-${name}`); fs.writeFileSync(f, text); return f; };
const COLORS = { [L.ready]: '0e8a16', [L.doing]: 'fbca04', [L.review]: '1d76db', [L.blocked]: 'b60205', 'tipo:feat': 'c5def5', 'tipo:fix': 'f9d0c4' };

function ensureLabels(names) {
  for (const n of names) gh(['label', 'create', n, '--force', '--color', COLORS[n] || (n.startsWith('prd:') ? 'ededed' : 'cccccc')], { allowFail: true });
}

function issueBody(s, type) {
  const crit = s.criteria.length ? s.criteria.map((c) => `- [ ] ${c}`).join('\n') : '- [ ] (el PRD no trae criterios para esta sección: definilos antes de implementar)';
  return [
    s.text.trim(), '', '---', '',
    '## Criterios de aceptación', '', crit, '',
    '## Contrato de entrega', '',
    `- Rama \`${cfg.branchPrefix[type] || type + '/'}<número>-<slug>\`, worktree propio, PR con \`Closes #<número>\`.`,
    '- El implementador cierra con la **tarjeta de entrega** (JSON validado: comandos ejecutados, pruebas, criterios con evidencia, puntos ciegos).',
    '- Lo revisa un auditor distinto del que implementó. Las pruebas tienen que fallar sin el cambio.',
    '- Si falta información, se pregunta en este issue: no se lee el PRD completo ni se inventa.',
  ].join('\n');
}

function create() {
  const id = argv[1];
  if (!id || !/^[A-Z]{1,4}-\d{1,4}$/.test(id)) throw new Error('Uso: node ticket.cjs create <PRD-ID> [--type feat|fix] [--title "..."]');
  const type = get('--type') || 'feat';
  if (!['feat', 'fix'].includes(type)) throw new Error('--type es feat o fix');
  const s = prd.slice(root, cfg.prd, id);
  const title = get('--title') || `${id} ${s.title}`;
  let body = issueBody(s, type);
  if (body.length > 60000) body = body.slice(0, 60000) + '\n\n> Rebanada truncada: partí la sección del PRD.';
  const labels = [`prd:${id}`, `tipo:${type}`, L.ready];
  if (has('--dry-run')) { console.log(`Título: ${title}\nEtiquetas: ${labels.join(', ')}\n\n${body}`); return; }
  if (!has('--force')) {
    const prev = ghJson(['issue', 'list', '--label', `prd:${id}`, '--state', 'open', '--json', 'number,title,url']) || [];
    if (prev.length) { console.log(`Ya hay un issue abierto para ${id}: #${prev[0].number} ${prev[0].url}. Usá --force para crear otro.`); return; }
  }
  ensureLabels(labels);
  const f = tmpFile('issue.md', body);
  try {
    const r = gh(['issue', 'create', '--title', title, '--body-file', f, ...labels.flatMap((l) => ['--label', l])]);
    const n = (r.out.match(/\/issues\/(\d+)/) || [])[1];
    console.log(`Creado #${n || '?'}: ${title}\n${r.out}`);
    if (s.missing.length) console.log(`AVISO la sección cita ids que no existen en el PRD: ${s.missing.join(', ')}`);
  } finally { fs.rmSync(f, { force: true }); }
}

function issue(n) {
  if (!/^\d+$/.test(String(n || ''))) throw new Error('Falta el número de issue.');
  return ghJson(['issue', 'view', String(n), '--json', 'number,title,body,labels,state,url,assignees']);
}
const typeOf = (i) => ((i.labels || []).some((l) => l.name === 'tipo:fix') ? 'fix' : 'feat');
const branchOf = (i) => `${cfg.branchPrefix[typeOf(i)] || typeOf(i) + '/'}${i.number}-${slugify(i.title)}`;

function claim() {
  const i = issue(argv[1]);
  if (i.state !== 'OPEN') throw new Error(`#${i.number} está ${i.state}.`);
  ensureLabels([L.doing]);
  gh(['issue', 'edit', String(i.number), '--add-assignee', '@me', '--add-label', L.doing, '--remove-label', L.ready], { allowFail: true });
  const branch = branchOf(i);
  const wt = branch.replace('/', '-');
  if (has('--develop')) gh(['issue', 'develop', String(i.number), '--name', branch], { allowFail: true });
  console.log(JSON.stringify({ issue: i.number, title: i.title, branch, worktree: wt, type: typeOf(i) }, null, 2));
}

function context() {
  const i = issue(argv[1]);
  const text = `# Ticket #${i.number}: ${i.title}\n${i.url}\n\n${i.body || ''}\n`;
  if (get('--out')) { fs.mkdirSync(path.dirname(path.resolve(get('--out'))), { recursive: true }); fs.writeFileSync(get('--out'), text); console.log(`Escrito ${get('--out')} (${text.length} caracteres)`); }
  else process.stdout.write(text);
}

function renderCard(file) {
  const card = require('../../dispatch/scripts/card.cjs');
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const v = card.validate(c);
  if (v.length) throw new Error(`La tarjeta ${file} no es válida:\n- ${v.join('\n- ')}`);
  return { summary: c.summary, md: card.render(c) };
}

function pr() {
  const i = issue(argv[1]);
  const branch = git(['branch', '--show-current']).stdout.trim();
  if (!new RegExp(`^(feat|fix)/${i.number}-`).test(branch) && !has('--force')) throw new Error(`La rama actual (${branch || 'ninguna'}) no es la del ticket #${i.number} (esperada ${branchOf(i)}). Usá --force si es a propósito.`);
  const c = get('--card') ? renderCard(get('--card')) : null;
  const body = [`Closes #${i.number}`, '', '## Resumen', '', c ? c.summary : '(completar)', '', ...(c ? [c.md] : ['> Sin tarjeta de entrega: el auditor la va a pedir.'])].join('\n') + '\n';
  const title = `${typeOf(i)}: ${i.title.replace(/^[A-Z]{1,4}-\d{1,4}\s+/, '')} (#${i.number})`;
  const base = get('--base') || (git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).stdout.trim().replace(/^origin\//, '') || 'main');
  if (has('--dry-run')) { console.log(`Título: ${title}\nBase: ${base}\n\n${body}`); return; }
  if (has('--push')) { const p = git(['push', '-u', 'origin', 'HEAD']); if (p.status !== 0) throw new Error(`git push falló: ${p.stderr.trim()}`); }
  const f = tmpFile('pr.md', body);
  try {
    const r = gh(['pr', 'create', '--title', title, '--body-file', f, '--base', base, ...(has('--draft') ? ['--draft'] : [])]);
    ensureLabels([L.review]);
    gh(['issue', 'edit', String(i.number), '--add-label', L.review, '--remove-label', L.doing], { allowFail: true });
    console.log(r.out);
  } finally { fs.rmSync(f, { force: true }); }
}

function board() {
  const issues = ghJson(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,labels,assignees,url']) || [];
  const prs = ghJson(['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,isDraft,reviewDecision,statusCheckRollup,body,url']) || [];
  const lab = (i) => (i.labels || []).map((l) => l.name);
  const estado = (i) => [L.blocked, L.review, L.doing, L.ready].find((x) => lab(i).includes(x)) || 'sin estado';
  const rows = issues.map((i) => {
    const p = prs.find((x) => linkedIssue(x) === i.number);
    return { issue: i.number, title: i.title, estado: estado(i), prd: (lab(i).find((x) => x.startsWith('prd:')) || '').slice(4), asignado: (i.assignees || []).map((a) => a.login).join(', '), pr: p ? p.number : null, checks: p ? checksState(p) : null, revision: p ? (p.reviewDecision || 'pendiente') : null };
  });
  const orphan = prs.filter((p) => !issues.some((i) => i.number === linkedIssue(p))).map((p) => ({ pr: p.number, title: p.title, checks: checksState(p) }));
  return { rows, orphan };
}

function status() {
  const b = board();
  if (has('--json')) { console.log(JSON.stringify(b, null, 2)); return; }
  const order = [L.blocked, L.review, L.doing, L.ready, 'sin estado'];
  b.rows.sort((a, c) => order.indexOf(a.estado) - order.indexOf(c.estado) || a.issue - c.issue);
  for (const r of b.rows) console.log(`#${r.issue}  ${r.estado.replace(/^estado:/, '').padEnd(12)} ${r.title}${r.pr ? `  → PR #${r.pr} (checks ${r.checks}, revisión ${r.revision})` : ''}${r.asignado ? `  @${r.asignado}` : ''}`);
  for (const p of b.orphan) console.log(`PR #${p.pr} sin issue enlazado: ${p.title} (checks ${p.checks})`);
  if (!b.rows.length && !b.orphan.length) console.log('No hay issues ni PRs abiertos.');
}

if (require.main === module) {
  try {
    if (cmd === 'labels') { ensureLabels([L.ready, L.doing, L.review, L.blocked, 'tipo:feat', 'tipo:fix']); console.log('Etiquetas listas.'); }
    else if (cmd === 'create') create();
    else if (cmd === 'claim') claim();
    else if (cmd === 'context') context();
    else if (cmd === 'pr') pr();
    else if (cmd === 'status') status();
    else { console.error('Uso: node ticket.cjs labels|create <ID>|claim <N>|context <N>|pr <N>|status'); process.exit(2); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { board, slugify };
