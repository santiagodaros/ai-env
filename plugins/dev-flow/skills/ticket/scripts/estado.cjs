#!/usr/bin/env node
// Genera el estado del proyecto desde GitHub y el PRD (no desde la memoria del chat).
// Uso: node estado.cjs [--write] [--days 14] [--json]
// Escribe entre <!-- estado:start --> y <!-- estado:end --> en el archivo de estado de .claude/dev-flow.json
// (por defecto docs/STATE.md; en tu forma de trabajar, docs/ESTADO.md). Lo de afuera de las marcas no se toca:
// ahí van las decisiones y notas escritas a mano. Sin --write, imprime el bloque.
'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../../../lib/config.cjs');
const { ghJson, linkedIssue, checksState } = require('../../../lib/gh.cjs');
const prd = require('../../prd/scripts/prd.cjs');

const argv = process.argv.slice(2);
const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const root = config.repoRoot(get('--dir') || process.cwd());
const cfg = config.load(root);
const L = cfg.labels;
const days = Number(get('--days') || 14);

function collect() {
  const issues = ghJson(['issue', 'list', '--state', 'all', '--limit', '500', '--json', 'number,title,state,labels,closedAt,url']) || [];
  const open = ghJson(['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,isDraft,reviewDecision,statusCheckRollup,body']) || [];
  const merged = ghJson(['pr', 'list', '--state', 'merged', '--limit', '50', '--json', 'number,title,mergedAt,headRefName,body']) || [];
  let secs = [];
  const prdFile = path.join(root, cfg.prd);
  if (fs.existsSync(prdFile)) secs = prd.parse(fs.readFileSync(prdFile, 'utf8')).secs.filter((s) => !/^G-/.test(s.id));
  return { issues, open, merged, secs };
}

function build({ issues, open, merged, secs }) {
  const lab = (i) => (i.labels || []).map((l) => l.name);
  const prdOf = (i) => (lab(i).find((x) => x.startsWith('prd:')) || '').slice(4);
  const estado = (i) => (i.state === 'CLOSED' ? 'cerrado' : ([L.blocked, L.review, L.doing, L.ready].find((x) => lab(i).includes(x)) || 'abierto').replace(/^estado:/, ''));
  const since = Date.now() - days * 86400000;
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const out = [`_Generado ${now} UTC por \`estado.cjs\` desde GitHub y \`${cfg.prd}\`. No editar entre las marcas._`, ''];
  // Cobertura del PRD
  if (secs.length) {
    const rows = secs.map((s) => {
      const its = issues.filter((i) => prdOf(i) === s.id);
      const st = its.length ? (its.every((i) => i.state === 'CLOSED') ? 'cerrado' : estado(its.find((i) => i.state === 'OPEN'))) : 'sin ticket';
      return { id: s.id, title: s.title, st, nums: its.map((i) => `#${i.number}`).join(' ') };
    });
    const done = rows.filter((r) => r.st === 'cerrado').length;
    out.push(`### Cobertura del PRD: ${done}/${rows.length} cerrados`, '', '| Id | Requerimiento | Estado | Issues |', '|---|---|---|---|', ...rows.map((r) => `| ${r.id} | ${r.title.replace(/\|/g, '/')} | ${r.st} | ${r.nums} |`), '');
  }
  // En curso
  const active = issues.filter((i) => i.state === 'OPEN' && [L.doing, L.review, L.blocked].some((x) => lab(i).includes(x)));
  out.push('### En curso', '');
  if (!active.length) out.push('- Nada en curso.');
  for (const i of active) {
    const p = open.find((x) => linkedIssue(x) === i.number);
    out.push(`- #${i.number} ${i.title} — ${estado(i)}${p ? `; PR #${p.number}${p.isDraft ? ' (borrador)' : ''}, checks ${checksState(p)}, revisión ${(p.reviewDecision || 'pendiente').toLowerCase()}` : ''}`);
  }
  const blocked = issues.filter((i) => i.state === 'OPEN' && lab(i).includes(L.blocked));
  if (blocked.length) out.push('', `**Bloqueados (${blocked.length}):** ${blocked.map((i) => `#${i.number}`).join(', ')} — necesitan decisión del Tech Lead.`);
  // Listos para tomar
  const ready = issues.filter((i) => i.state === 'OPEN' && lab(i).includes(L.ready));
  out.push('', `### Listos para tomar (${ready.length})`, '', ...(ready.length ? ready.slice(0, 15).map((i) => `- #${i.number} ${i.title}`) : ['- Ninguno.']));
  // Hecho
  const recent = merged.filter((p) => Date.parse(p.mergedAt) >= since);
  out.push('', `### Mergeado en los últimos ${days} días (${recent.length})`, '', ...(recent.length ? recent.map((p) => `- PR #${p.number} ${p.title}${linkedIssue(p) ? ` (cierra #${linkedIssue(p)})` : ''} — ${p.mergedAt.slice(0, 10)}`) : ['- Nada.']));
  const orphan = open.filter((p) => !linkedIssue(p));
  if (orphan.length) out.push('', `**PRs sin issue enlazado:** ${orphan.map((p) => `#${p.number}`).join(', ')} (agregá "Closes #N").`);
  return out.join('\n');
}

function write(block) {
  const f = path.join(root, cfg.state);
  const START = '<!-- estado:start -->', END = '<!-- estado:end -->';
  let s = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : `# Estado\n\nDecisiones y notas a mano arriba o abajo del bloque generado.\n\n## Decisiones\n- \n\n## Estado generado\n\n${START}\n${END}\n`;
  if (!s.includes(START) || !s.includes(END)) s = s.replace(/\s*$/, `\n\n## Estado generado\n\n${START}\n${END}\n`);
  s = s.replace(new RegExp(`${START}[\\s\\S]*?${END}`), `${START}\n${block}\n${END}`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, s);
  return cfg.state;
}

if (require.main === module) {
  try {
    const data = collect();
    if (argv.includes('--json')) { console.log(JSON.stringify(data, null, 2)); process.exit(0); }
    const block = build(data);
    if (argv.includes('--write')) console.log(`Actualizado ${write(block)}.`);
    else console.log(block);
  } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { build };
