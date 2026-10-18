#!/usr/bin/env node
// Plan de product engineer a partir de una idea definida: docs/ideas/<slug>/plan.json es la fuente de verdad;
// PLAN.md y el PRD (formato de /dev-flow:prd) se generan de ahí. El modelo completa el JSON; este script decide.
// Uso:
//   node plan.cjs new <slug>             esqueleto desde la idea (exige decisión "avanzar")
//   node plan.cjs check <slug> [--json]  sale con 1 si el plan no está listo para arquitectura y tickets
//   node plan.cjs render <slug>          PLAN.md y el PRD: docs/PRD.md si no existe; si existe, PRD.draft.md al lado del plan
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const fail = (m, code = 1) => { console.error(m); process.exit(code); };
const str = (v, n = 1) => typeof v === 'string' && v.trim().length >= n;
const arr = (v) => (Array.isArray(v) ? v : []);
const ID = /^[A-Z]{1,4}-\d{1,4}$/;
const SIZES = ['T', 'S', 'M', 'L'];
const today = () => new Date().toISOString().slice(0, 10);

function root() { const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : process.cwd(); }
const dirOf = (slug, R) => path.join(R, 'docs', 'ideas', slug);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

function skeleton(idea) {
  return {
    v: 1, slug: idea.slug, idea_title: idea.title, created: today(), updated: today(),
    outcome: (idea.metrics && idea.metrics.success_criteria) || '',
    appetite: (idea.mvp && idea.mvp.appetite) || '',
    scope_in: arr(idea.mvp && idea.mvp.in), scope_out: arr(idea.mvp && idea.mvp.out),
    no_gos: [], rabbit_holes: [],
    validation_first: [],
    accepted_assumptions: [],
    globals: [{ id: 'G-01', title: 'Stack y restricciones', text: 'Por decidir en /arch:arch-first.' }],
    slices: [],
    milestones: [],
    metrics_instrumentation: [],
    rollout: { strategy: '', rollback: '' },
    ops: { cost_estimate: '', support: '' },
    decisions_pending: [],
    risks: arr(idea.risks).map((r) => ({ ...r, owner_role: '' })),
  };
}

// Supuestos de la idea que siguen sin probar: cada uno necesita un experimento antes de construir o aceptarse con motivo.
const untested = (idea) => arr(idea.assumptions).filter((a) => a && (a.status || 'sin-probar') === 'sin-probar').map((a) => a.text);

function evaluate(plan, idea) {
  const p = plan || {};
  const ids = arr(p.slices).map((s) => s && s.id);
  const all = [...arr(p.globals).map((g) => g && g.id), ...ids];
  const errs = [];
  const add = (cond, m) => { if (cond) errs.push(m); };
  add(!str(p.outcome, 10), 'outcome: qué resultado medible busca el plan (sale de las métricas de la idea)');
  add(!str(p.appetite, 3), 'appetite: el tiempo máximo que vale la pena invertir');
  add(!arr(p.no_gos).length, 'no_gos: al menos una cosa que explícitamente no se hace');
  add(!arr(p.rabbit_holes).length, 'rabbit_holes: al menos un agujero técnico identificado, con la decisión que lo evita');
  for (const r of arr(p.rabbit_holes)) add(!(r && str(r.risk, 5) && str(r.decision, 5)), `rabbit_hole incompleto ("${String((r && r.risk) || '').slice(0, 40)}"): risk y decision`);
  add(!arr(p.globals).length, 'globals: al menos una sección G- (stack y restricciones; puede decir "por decidir en arch-first")');
  for (const g of arr(p.globals)) add(!(g && ID.test(g.id) && /^G-/.test(g.id) && str(g.title, 3) && str(g.text, 5)), `global inválida (${(g && g.id) || '?'}): id G-NN, title y text`);
  add(!arr(p.slices).length, 'slices: al menos una rebanada funcional (F-01…)');
  const dup = ids.filter((x, k) => ids.indexOf(x) !== k);
  add(dup.length, `slices: ids repetidos: ${[...new Set(dup)].join(', ')}`);
  for (const s of arr(p.slices)) {
    const id = (s && s.id) || '?';
    add(!(s && ID.test(s.id)), `slice ${id}: id con formato F-01, NF-02…`);
    add(!(s && str(s.title, 5)), `slice ${id}: title`);
    add(!(s && str(s.why, 10)), `slice ${id}: why (qué valor visible entrega)`);
    const c = arr(s && s.criteria).filter((x) => str(x, 5));
    add(!c.length, `slice ${id}: al menos un criterio de aceptación verificable`);
    add(c.length > 7, `slice ${id}: ${c.length} criterios; más de 7 no es un ticket, partila`);
    add(!(s && SIZES.includes(s.size)), `slice ${id}: size T, S, M o L`);
    for (const d of arr(s && s.depends_on)) add(!all.includes(d), `slice ${id}: depende de ${d}, que no existe`);
    const chars = JSON.stringify(s || {}).length;
    add(chars > 6000, `slice ${id}: ${chars} caracteres; una sección del PRD de más de 6000 no es un ticket`);
  }
  // Ciclos en dependencias.
  const deps = Object.fromEntries(arr(p.slices).filter((s) => s && s.id).map((s) => [s.id, arr(s.depends_on)]));
  const seen = {}; let cycle = null;
  const visit = (n, stack) => { if (cycle) return; if (stack.includes(n)) { cycle = [...stack.slice(stack.indexOf(n)), n]; return; } if (seen[n]) return; seen[n] = true; for (const d of deps[n] || []) visit(d, [...stack, n]); };
  for (const n of Object.keys(deps)) visit(n, []);
  add(cycle, `dependencias en ciclo: ${(cycle || []).join(' → ')}`);
  add(!arr(p.milestones).length, 'milestones: al menos un hito');
  const inMs = arr(p.milestones).flatMap((m) => arr(m && m.slices));
  for (const m of arr(p.milestones)) {
    const id = (m && m.id) || '?';
    add(!(m && str(m.goal, 10)), `hito ${id}: goal`);
    add(!(m && str(m.exit_criteria, 10)), `hito ${id}: exit_criteria (qué ve o puede hacer un usuario al terminarlo)`);
    add(!(m && m.user_visible === true), `hito ${id}: user_visible: true (cada hito entrega algo usable, no "backend listo")`);
    for (const s of arr(m && m.slices)) add(!ids.includes(s), `hito ${id}: incluye ${s}, que no es una rebanada`);
  }
  for (const s of ids) add(inMs.filter((x) => x === s).length !== 1, `${s}: tiene que estar en exactamente un hito`);
  const covered = [...arr(p.validation_first).map((v) => v && v.assumption), ...arr(p.accepted_assumptions).map((a) => a && a.assumption)];
  for (const a of untested(idea)) add(!covered.includes(a), `supuesto sin probar sin plan: "${a.slice(0, 60)}" (va a validation_first con un experimento, o a accepted_assumptions con motivo)`);
  for (const v of arr(p.validation_first)) add(!(v && str(v.experiment, 10) && str(v.success, 5) && str(v.cost, 2)), `validación incompleta ("${String((v && v.assumption) || '').slice(0, 40)}"): experiment, cost y success`);
  for (const a of arr(p.accepted_assumptions)) add(!(a && str(a.reason, 10)), `supuesto aceptado sin motivo ("${String((a && a.assumption) || '').slice(0, 40)}")`);
  const ns = idea && idea.metrics && idea.metrics.north_star;
  add(!arr(p.metrics_instrumentation).some((m) => m && str(m.metric) && str(m.event, 3)), 'metrics_instrumentation: cómo se mide cada métrica (evento o consulta y dónde)');
  add(ns && !arr(p.metrics_instrumentation).some((m) => m && m.metric === ns), `metrics_instrumentation: falta la métrica estrella ("${ns}")`);
  add(!(p.rollout && str(p.rollout.strategy, 5) && str(p.rollout.rollback, 5)), 'rollout: strategy y rollback');
  for (const d of arr(p.decisions_pending)) add(!(d && str(d.decision, 5) && arr(d.options).length >= 2), `decisión pendiente sin al menos dos opciones ("${String((d && d.decision) || '').slice(0, 40)}"): va a un ADR`);
  return { ready: !errs.length, errors: errs };
}

function prd(p, idea) {
  const L = [`# PRD: ${idea.title}`, '', `> Generado por /idea-lab:plan desde docs/ideas/${p.slug}/ el ${today()}. Completá \`Archivos:\` en cada sección después de aprobar la arquitectura: es el Alcance de cada ticket.`, '',
    `Resultado buscado: ${p.outcome}`, '', `Apetito: ${p.appetite}`, ''];
  for (const g of arr(p.globals)) L.push(`## [${g.id}] ${g.title}`, '', g.text, '');
  L.push('## [G-90] Fuera de alcance', '', ...arr(p.scope_out).concat(arr(p.no_gos)).map((x) => `- ${x}`), '');
  for (const s of arr(p.slices)) {
    L.push(`## [${s.id}] ${s.title}`, '');
    if (arr(s.depends_on).length) L.push(`Depende de: ${s.depends_on.join(', ')}`);
    L.push(`Tamaño: ${s.size}`);
    if (s.out_of_scope) L.push(`Fuera de alcance: ${s.out_of_scope}`);
    L.push('', s.why, '', ...arr(s.criteria).map((c) => `- [ ] ${c}`), '');
  }
  return L.join('\n');
}

function planMd(p, idea) {
  const L = (a, f = (x) => x) => (arr(a).length ? arr(a).map((x) => `- ${f(x)}`).join('\n') : '- (ninguno)');
  return [`# Plan: ${idea.title}`, '', `Resultado: ${p.outcome}`, '', `Apetito: ${p.appetite}`, '',
    '## Primero, validar (antes de construir)', '', L(p.validation_first, (v) => `**${v.assumption}** → ${v.experiment} (costo: ${v.cost}; vale si: ${v.success})`), '',
    arr(p.accepted_assumptions).length ? `Supuestos aceptados sin probar:\n\n${L(p.accepted_assumptions, (a) => `${a.assumption}: ${a.reason}`)}\n` : '',
    '## Alcance', '', 'Entra:', '', L(p.scope_in), '', 'Queda afuera:', '', L(p.scope_out), '', 'No se hace (no-gos):', '', L(p.no_gos), '',
    '## Agujeros evitados', '', L(p.rabbit_holes, (r) => `${r.risk} → ${r.decision}`), '',
    '## Hitos', '', ...arr(p.milestones).map((m) => `### ${m.id}: ${m.goal}\n\nRebanadas: ${arr(m.slices).join(', ')}\n\nSe termina cuando: ${m.exit_criteria}\n`),
    '## Rebanadas', '', '| Id | Título | Tamaño | Depende de |', '|---|---|---|---|', ...arr(p.slices).map((s) => `| ${s.id} | ${s.title} | ${s.size} | ${arr(s.depends_on).join(', ') || '—'} |`), '',
    '## Métricas e instrumentación', '', L(p.metrics_instrumentation, (m) => `${m.metric}: ${m.event}${m.where ? ` (${m.where})` : ''}`), '',
    '## Salida a producción', '', `- Estrategia: ${(p.rollout || {}).strategy || ''}`, `- Vuelta atrás: ${(p.rollout || {}).rollback || ''}`, '',
    '## Operación', '', `- Costo estimado: ${(p.ops || {}).cost_estimate || '(sin estimar)'}`, `- Soporte: ${(p.ops || {}).support || '(sin definir)'}`, '',
    '## Riesgos', '', L(p.risks, (r) => `**${r.kind}**: ${r.risk}. Mitigación: ${r.mitigation}${r.owner_role ? ` (responsable: ${r.owner_role})` : ''}`), '',
    '## Decisiones pendientes (ADR)', '', L(p.decisions_pending, (d) => `${d.decision}: ${arr(d.options).join(' / ')}`), '',
    '## Siguiente', '', '1. `/arch:arch-first` con este plan: arquitectura aprobada antes del código; las decisiones pendientes van con `/arch:adr`.', '2. Completar `Archivos:` en cada sección F- del PRD según la arquitectura.', '3. `/dev-flow:prd check`, y después `/dev-flow:dispatch` (tickets y workers) o `/dev-flow:feature-run` (una feature por sesión).', ''].join('\n');
}

function main() {
  const [cmd, slug] = argv;
  if (!['new', 'check', 'render'].includes(cmd) || !slug) fail('Uso: plan.cjs new|check|render <slug> (ver encabezado)', 2);
  const R = root();
  const d = dirOf(slug, R);
  const idea = readJson(path.join(d, 'idea.json'));
  if (!idea) fail(`No encuentro la idea "${slug}" (docs/ideas/${slug}/idea.json). Empezá por /idea-lab:shape.`);
  if (!idea.decision || idea.decision.value !== 'avanzar') fail(`La idea "${slug}" no tiene la decisión "avanzar" (estado: ${idea.status}). El plan arranca recién cuando la persona decide avanzar: /idea-lab:shape ${slug}.`);
  const pf = path.join(d, 'plan.json');
  if (cmd === 'new') {
    if (fs.existsSync(pf)) fail(`Ya existe ${path.relative(R, pf)}. Editalo; no lo piso.`);
    fs.writeFileSync(pf, JSON.stringify(skeleton(idea), null, 2) + '\n');
    console.log(`Plan creado: ${path.relative(R, pf)} (${untested(idea).length} supuesto(s) sin probar para resolver)`);
    return;
  }
  const plan = readJson(pf);
  if (!plan) fail(`${path.relative(R, pf)} no existe o no es JSON válido. Crealo con: plan.cjs new ${slug}`);
  const e = evaluate(plan, idea);
  if (cmd === 'check') {
    if (has('--json')) console.log(JSON.stringify(e, null, 2));
    else console.log(e.ready ? `LISTO: el plan de "${slug}" cubre todo para arquitectura y tickets.` : `INCOMPLETO (${e.errors.length}):\n- ${e.errors.join('\n- ')}`);
    process.exit(e.ready ? 0 : 1);
  }
  if (!e.ready) fail(`El plan no está listo (${e.errors.length} punto(s)). Corré plan.cjs check ${slug}.`);
  fs.writeFileSync(path.join(d, 'PLAN.md'), planMd(plan, idea));
  const target = fs.existsSync(path.join(R, 'docs', 'PRD.md')) ? path.join(d, 'PRD.draft.md') : path.join(R, 'docs', 'PRD.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, prd(plan, idea));
  console.log(`${path.relative(R, path.join(d, 'PLAN.md'))} · ${path.relative(R, target)}${target.endsWith('PRD.draft.md') ? ' (docs/PRD.md ya existía: no lo piso; integrá las secciones a mano)' : ''}`);
}

if (require.main === module) main();
module.exports = { evaluate, prd, skeleton, untested };
