#!/usr/bin/env node
// Una idea como expediente: docs/ideas/<slug>/idea.json es la fuente de verdad; IDEA.md y preview.html se generan de ahí.
// El modelo completa el JSON; este script decide si la idea está definida (con reglas fijas, no con su criterio).
// Uso:
//   node idea.cjs new "<título>" [--slug <slug>]       crea el expediente vacío
//   node idea.cjs status [--json]                       una línea por idea: estado y ángulos cubiertos
//   node idea.cjs check <slug> [--json]                 qué ángulos faltan; sale con 1 si la idea no está definida
//   node idea.cjs render <slug>                         IDEA.md y preview.html (autocontenido, se abre sin red)
//   node idea.cjs decide <slug> avanzar|pivotear|descartar --reason "<motivo>"
//                                                       registra la decisión de la persona; avanzar exige check en verde
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k) => argv.includes(k);
const fail = (m, code = 1) => { console.error(m); process.exit(code); };

function root() { const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : process.cwd(); }
const ideasDir = (R = root()) => path.join(R, 'docs', 'ideas');
const fileOf = (slug, R) => path.join(ideasDir(R), slug, 'idea.json');
const slugify = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 6).join('-');
const today = () => new Date().toISOString().slice(0, 10);
const str = (v, n = 1) => typeof v === 'string' && v.trim().length >= n;
const arr = (v) => (Array.isArray(v) ? v : []);
const url = (v) => typeof v === 'string' && /^https?:\/\/\S+\.\S+/.test(v.trim());

function skeleton(title, slug) {
  return {
    v: 1, slug, title, created: today(), updated: today(), status: 'borrador',
    pitch: '',
    problem: { statement: '', who: '', jtbd: '', current_alternative: '', pain_evidence: [] },
    users: [],
    value: { proposition: '', differentiation: '' },
    market: { checked_at: '', verdict: '', unavailable_reason: '', competitors: [], alternatives: [], demand_signals: [] },
    business: { model: '', pricing_hypothesis: '', cost_benefit: '', channels: [] },
    feasibility: { approach: '', unknowns: [], dependencies: [] },
    risks: [],
    premortem: [],
    metrics: { north_star: '', leading: [], success_criteria: '' },
    mvp: { appetite: '', in: [], out: [] },
    assumptions: [],
    kill_criteria: [],
    open_questions: [],
    skeptic: { objections: [] },
    prfaq: { headline: '', subheadline: '', problem: '', solution: '', customer_quote: '', how_to_start: '', faq_external: [], faq_internal: [] },
    decision: null,
    log: [],
  };
}

const RISK_KINDS = ['tecnico', 'mercado', 'legal', 'seguridad', 'operacion', 'dinero', 'adopcion'];
const KIND = { tecnico: 'técnico', operacion: 'operación', adopcion: 'adopción' };
const kindOf = (k) => KIND[k] || k;
const VERDICTS = ['hueco', 'nicho', 'saturado', 'sin-datos'];
const SEVERITIES = ['alta', 'media', 'baja'];

// Cada ángulo: id, nombre, y la función que devuelve lo que falta (vacío = cubierto).
const LENSES = [
  ['problema', 'Problema y quién lo sufre', (i) => [
    !str(i.problem.statement, 30) && 'problem.statement: el problema en una o dos oraciones (30+ caracteres)',
    !str(i.problem.who, 3) && 'problem.who: quién lo sufre, concreto (rol, tipo de empresa)',
    !str(i.problem.jtbd, 10) && 'problem.jtbd: el trabajo que la persona intenta hacer ("cuando…, quiero…, para…")',
    !str(i.problem.current_alternative, 5) && 'problem.current_alternative: cómo lo resuelve hoy (aunque sea Excel o nada)',
  ]],
  ['evidencia', 'Evidencia del dolor', (i) => {
    const ev = arr(i.problem.pain_evidence);
    return [!ev.length && 'problem.pain_evidence: al menos una evidencia del dolor (dato, entrevista, foro)',
      ...ev.filter((e) => !(e && str(e.claim, 5) && (url(e.source) || /^(entrevista|dato propio|experiencia propia|ticket|métrica):/i.test(String(e.source || ''))))).map((e) => `evidencia sin fuente ("${String((e && e.claim) || '').slice(0, 50)}"): poné url o "entrevista: …", o pasala a supuestos`)];
  }],
  ['usuarios', 'Usuarios y necesidad', (i) => [!arr(i.users).some((u) => u && str(u.segment, 3) && str(u.need, 5)) && 'users: al menos un segmento con su necesidad']],
  ['propuesta', 'Propuesta de valor y diferencia', (i) => [
    !str(i.value.proposition, 20) && 'value.proposition: qué cambia para el usuario, en su idioma',
    !str(i.value.differentiation, 15) && 'value.differentiation: por qué esto y no lo que ya existe (sale del análisis de mercado)',
  ]],
  ['mercado', 'Mercado: competencia, alternativas y demanda', (i) => {
    const m = i.market || {};
    if (m.verdict === 'sin-datos' && str(m.unavailable_reason, 10)) return [];
    const all = [...arr(m.competitors), ...arr(m.alternatives)];
    const days = m.checked_at ? (Date.now() - Date.parse(m.checked_at)) / 86400000 : Infinity;
    return [
      all.length < 3 && 'market: al menos 3 entre competidores y alternativas (incluí el statu quo o el "hágalo usted mismo")',
      ...all.filter((c) => !(c && str(c.name, 2) && str(c.what, 5) && (url(c.url) || ['status-quo', 'diy', 'interno'].includes(c.kind)))).map((c) => `market: "${(c && c.name) || '?'}" necesita qué hace y una url (o kind status-quo/diy/interno)`),
      !all.some((c) => c && str(c.gap, 5)) && 'market: qué hueco deja cada alternativa (gap) en al menos una',
      !arr(m.demand_signals).some((d) => d && str(d.claim, 5) && url(d.url)) && 'market.demand_signals: al menos una señal de demanda con url (foro, reseña, búsqueda, informe)',
      !VERDICTS.includes(m.verdict) && `market.verdict: ${VERDICTS.join(', ')}`,
      !(days <= 30) && 'market.checked_at: fecha de la búsqueda (de los últimos 30 días)',
    ];
  }],
  ['negocio', 'Modelo de negocio o costo-beneficio', (i) => [
    !str(i.business.model, 5) && 'business.model: cómo genera valor (venta, suscripción, servicio, ahorro interno)',
    !(str(i.business.pricing_hypothesis, 5) || str(i.business.cost_benefit, 10)) && 'business: hipótesis de precio, o costo-beneficio si es interno',
  ]],
  ['factibilidad', 'Factibilidad técnica', (i) => [
    !str(i.feasibility.approach, 20) && 'feasibility.approach: cómo se construiría, a grandes rasgos',
    !arr(i.feasibility.unknowns).length && 'feasibility.unknowns: lo que todavía no se sabe si se puede (al menos uno)',
  ]],
  ['riesgos', 'Riesgos con mitigación', (i) => {
    const r = arr(i.risks);
    const kinds = new Set(r.map((x) => x && x.kind));
    return [r.length < 3 && 'risks: al menos 3', kinds.size < 3 && `risks: de al menos 3 tipos distintos (${RISK_KINDS.join(', ')})`,
      ...r.filter((x) => !(x && str(x.risk, 5) && RISK_KINDS.includes(x.kind) && str(x.mitigation, 5))).map((x) => `riesgo incompleto ("${String((x && x.risk) || '').slice(0, 40)}"): risk, kind y mitigation`)];
  }],
  ['premortem', 'Pre-mortem (por qué fracasó en 12 meses)', (i) => [arr(i.premortem).filter((x) => str(x, 10)).length < 3 && 'premortem: al menos 3 motivos concretos de fracaso']],
  ['metricas', 'Métricas de éxito', (i) => [
    !str(i.metrics.north_star, 5) && 'metrics.north_star: la métrica que dice si funciona',
    !(str(i.metrics.success_criteria, 5) && /\d/.test(i.metrics.success_criteria)) && 'metrics.success_criteria: un umbral con número y plazo',
  ]],
  ['mvp', 'Alcance mínimo y apetito', (i) => [
    !str(i.mvp.appetite, 3) && 'mvp.appetite: cuánto tiempo vale la pena invertir (no cuánto lleva)',
    !arr(i.mvp.in).length && 'mvp.in: lo que entra en la primera versión',
    !arr(i.mvp.out).length && 'mvp.out: lo que queda afuera a propósito',
  ]],
  ['supuestos', 'Supuestos y cómo probarlos', (i) => {
    const a = arr(i.assumptions);
    return [a.length < 3 && 'assumptions: al menos 3', ...a.filter((x) => !(x && str(x.text, 5) && str(x.test, 5))).map((x) => `supuesto sin prueba ("${String((x && x.text) || '').slice(0, 40)}"): cómo se valida barato`)];
  }],
  ['escéptico', 'Objeciones del escéptico', (i) => {
    const o = arr(i.skeptic && i.skeptic.objections);
    return [o.length < 3 && 'skeptic.objections: al menos 3 (corré el subagente idea-lab:skeptic)',
      ...o.filter((x) => x && x.severity === 'alta' && !str(x.answer, 10)).map((x) => `objeción alta sin respuesta: "${String(x.objection || '').slice(0, 60)}"`),
      ...o.filter((x) => !(x && SEVERITIES.includes(x.severity))).map(() => `objeción con severidad inválida (${SEVERITIES.join(', ')})`)];
  }],
  ['prfaq', 'Comunicado y preguntas (working backwards)', (i) => {
    const p = i.prfaq || {};
    return [!str(p.headline, 10) && 'prfaq.headline', !str(p.problem, 20) && 'prfaq.problem', !str(p.solution, 20) && 'prfaq.solution',
      arr(p.faq_external).filter((q) => q && str(q.q) && str(q.a)).length < 3 && 'prfaq.faq_external: al menos 3 preguntas de usuarios con respuesta',
      arr(p.faq_internal).filter((q) => q && str(q.q) && str(q.a)).length < 3 && 'prfaq.faq_internal: al menos 3 preguntas internas (costo, riesgo, por qué ahora)'];
  }],
  ['corte', 'Criterios para abandonar', (i) => [!arr(i.kill_criteria).filter((x) => str(x, 10)).length && 'kill_criteria: al menos uno, medible (qué resultado haría dejar la idea)']],
  ['preguntas', 'Preguntas abiertas que bloquean', (i) => arr(i.open_questions).filter((q) => q && q.blocking).map((q) => `pregunta abierta que bloquea: "${String(q.q || '').slice(0, 60)}"`)],
];

function privateTerms(R, text) {
  let terms = [];
  try { terms = fs.readFileSync(path.join(R, '.private-terms'), 'utf8').split(/\r?\n/).map((t) => t.trim()).filter((t) => t && !t.startsWith('#')); } catch { return []; }
  const low = text.toLowerCase();
  return terms.filter((t) => low.includes(t.toLowerCase()));
}

function load(slug, R = root()) {
  const f = fileOf(slug, R);
  if (!fs.existsSync(f)) fail(`No existe la idea "${slug}" (${path.relative(R, f)}). Creala con: idea.cjs new "<título>"`);
  try { return { idea: JSON.parse(fs.readFileSync(f, 'utf8')), f, R }; } catch (e) { fail(`${path.relative(R, f)} no es JSON válido: ${e.message}`); }
}

// Completa con los valores vacíos del esqueleto lo que el JSON no trae, para que ninguna regla falle por un campo ausente.
function normalize(idea) {
  const sk = skeleton('', '');
  const i = { ...sk, ...idea };
  for (const k of ['problem', 'value', 'market', 'business', 'feasibility', 'metrics', 'mvp', 'skeptic', 'prfaq']) i[k] = { ...sk[k], ...(idea[k] && typeof idea[k] === 'object' ? idea[k] : {}) };
  return i;
}

function evaluate(idea, R) {
  const i = normalize(idea);
  const lenses = LENSES.map(([id, name, fn]) => { let miss; try { miss = fn(i).filter(Boolean); } catch (e) { miss = [`error al evaluar: ${e.message}`]; } return { id, name, ok: !miss.length, missing: miss }; });
  const leaked = privateTerms(R, JSON.stringify(idea));
  if (leaked.length) lenses.push({ id: 'privado', name: 'Sin términos privados', ok: false, missing: [`aparecen ${leaked.length} término(s) de .private-terms: reemplazalos por un alias`] });
  const ok = lenses.filter((l) => l.ok).length;
  return { slug: idea.slug, status: idea.status, ready: ok === lenses.length, covered: ok, total: lenses.length, lenses };
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const li = (a, f = (x) => esc(x)) => (arr(a).length ? `<ul>${arr(a).map((x) => `<li>${f(x)}</li>`).join('')}</ul>` : '<p class="empty">Sin completar</p>');
const link = (u, t) => (url(u) ? `<a href="${esc(u)}" rel="noopener">${esc(t || u)}</a>` : esc(t || ''));

function renderHtml(i, ev) {
  const m = i.market || {}, p = i.prfaq || {};
  const comp = [...arr(m.competitors).map((c) => ({ ...c, t: 'Competidor' })), ...arr(m.alternatives).map((c) => ({ ...c, t: 'Alternativa' }))];
  const lensRows = ev.lenses.map((l) => `<li class="${l.ok ? 'ok' : 'miss'}"><span>${l.ok ? '✓' : '·'}</span> ${esc(l.name)}${l.ok ? '' : `<small>${esc(l.missing[0] || '')}</small>`}</li>`).join('');
  const d = i.decision;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(i.title || i.slug)} · idea</title>
<style>
:root{--bg:#f6f7f4;--card:#fff;--fg:#1d2321;--muted:#5d6a65;--line:#d9dfdb;--accent:#1f6f5b;--warn:#a2561b;--ok:#2f7d4a;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#121614;--card:#1a201d;--fg:#e6ece9;--muted:#9aa8a2;--line:#2c3531;--accent:#5ec4a6;--warn:#e0a46a;--ok:#77c993;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 16px}
main{max-width:1080px;margin:0 auto;display:grid;gap:20px}h1,h2,h3{line-height:1.2;text-wrap:balance;margin:0}
h1{font-size:28px}h2{font-size:17px;margin-bottom:10px}h3{font-size:14px;color:var(--muted);margin:12px 0 4px}
.lede{color:var(--muted);max-width:68ch;margin:6px 0 0}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;min-width:0}
.pr{border-left:4px solid var(--accent)}.pr .head{font-size:20px;font-weight:650}.pr blockquote{margin:10px 0;padding-left:12px;border-left:2px solid var(--line);color:var(--muted)}
ul{margin:4px 0;padding-left:18px}li{margin:2px 0}.empty{color:var(--muted);font-style:italic;margin:4px 0}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
.scroll{overflow-x:auto}.lenses{list-style:none;padding:0;columns:2 240px}.lenses li{break-inside:avoid;padding:3px 0}.lenses span{display:inline-block;width:1.2em;font-weight:700}
.lenses .ok span{color:var(--ok)}.lenses .miss span{color:var(--warn)}.lenses small{display:block;color:var(--muted);margin-left:1.2em}
.meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--muted);font-size:13px}.tag{border:1px solid var(--line);border-radius:99px;padding:1px 9px}
.sev-alta{color:var(--warn);font-weight:600}a{color:var(--accent)}
</style></head><body><main>
<header><h1>${esc(i.title || i.slug)}</h1><p class="lede">${esc(i.pitch)}</p>
<div class="meta"><span class="tag">${esc(i.status)}</span><span>${ev.covered} de ${ev.total} ángulos cubiertos</span>${m.verdict ? `<span>Mercado: ${esc(m.verdict)}${m.checked_at ? ` (${esc(m.checked_at)})` : ''}</span>` : ''}${d ? `<span>Decisión: <strong>${esc(d.value)}</strong> — ${esc(d.reason)}</span>` : ''}</div></header>

<section class="pr"><h2>Si existiera hoy</h2><p class="head">${esc(p.headline) || '<span class="empty">Titular sin escribir</span>'}</p><p>${esc(p.subheadline)}</p>
<h3>El problema</h3><p>${esc(p.problem)}</p><h3>La solución</h3><p>${esc(p.solution)}</p>${p.customer_quote ? `<blockquote>${esc(p.customer_quote)}</blockquote>` : ''}${p.how_to_start ? `<h3>Cómo se empieza</h3><p>${esc(p.how_to_start)}</p>` : ''}</section>

<div class="grid">
<section><h2>Problema</h2><p>${esc(i.problem && i.problem.statement)}</p><h3>Quién</h3><p>${esc(i.problem && i.problem.who)}</p><h3>Trabajo a resolver</h3><p>${esc(i.problem && i.problem.jtbd)}</p><h3>Hoy lo resuelve con</h3><p>${esc(i.problem && i.problem.current_alternative)}</p><h3>Evidencia</h3>${li(i.problem && i.problem.pain_evidence, (e) => `${esc(e.claim)} ${url(e.source) ? link(e.source, '↗') : `<small>(${esc(e.source)})</small>`}`)}</section>
<section><h2>Propuesta</h2><p>${esc(i.value && i.value.proposition)}</p><h3>Por qué esto y no lo que existe</h3><p>${esc(i.value && i.value.differentiation)}</p><h3>Usuarios</h3>${li(i.users, (u) => `<strong>${esc(u.segment)}</strong>: ${esc(u.need)}`)}</section>
<section><h2>Alcance mínimo</h2><h3>Apetito</h3><p>${esc(i.mvp && i.mvp.appetite)}</p><h3>Entra</h3>${li(i.mvp && i.mvp.in)}<h3>Queda afuera</h3>${li(i.mvp && i.mvp.out)}</section>
</div>

<section><h2>Mercado</h2>${m.verdict === 'sin-datos' ? `<p class="empty">Sin datos de mercado: ${esc(m.unavailable_reason)}</p>` : ''}<div class="scroll"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>Qué hace</th><th>Precio</th><th>Hueco que deja</th></tr></thead><tbody>${comp.map((c) => `<tr><td>${link(c.url, c.name)}</td><td>${esc(c.kind || c.t)}</td><td>${esc(c.what)}</td><td>${esc(c.price || '')}</td><td>${esc(c.gap || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin relevar</td></tr>'}</tbody></table></div>
<h3>Señales de demanda</h3>${li(m.demand_signals, (s) => `${esc(s.claim)} ${link(s.url, '↗')}${s.date ? ` <small>${esc(s.date)}</small>` : ''}`)}</section>

<div class="grid">
<section><h2>Negocio</h2><p>${esc(i.business && i.business.model)}</p><h3>Precio o costo-beneficio</h3><p>${esc((i.business && (i.business.pricing_hypothesis || i.business.cost_benefit)) || '')}</p><h3>Canales</h3>${li(i.business && i.business.channels)}</section>
<section><h2>Factibilidad</h2><p>${esc(i.feasibility && i.feasibility.approach)}</p><h3>Lo que no se sabe</h3>${li(i.feasibility && i.feasibility.unknowns)}<h3>Depende de</h3>${li(i.feasibility && i.feasibility.dependencies)}</section>
<section><h2>Métricas</h2><h3>Estrella</h3><p>${esc(i.metrics && i.metrics.north_star)}</p><h3>Éxito si</h3><p>${esc(i.metrics && i.metrics.success_criteria)}</p><h3>Se abandona si</h3>${li(i.kill_criteria)}</section>
</div>

<div class="grid">
<section><h2>Riesgos</h2>${li(i.risks, (r) => `<strong>${esc(kindOf(r.kind))}</strong>: ${esc(r.risk)}<br><small>Mitigación: ${esc(r.mitigation)}</small>`)}</section>
<section><h2>Pre-mortem: por qué fracasó</h2>${li(i.premortem)}</section>
<section><h2>Supuestos a probar</h2>${li(i.assumptions, (a) => `${esc(a.text)}<br><small>Prueba: ${esc(a.test)} · ${esc(a.status || 'sin-probar')}</small>`)}</section>
</div>

<div class="grid">
<section><h2>Objeciones del escéptico</h2>${li(i.skeptic && i.skeptic.objections, (o) => `<span class="sev-${esc(o.severity)}">${esc(o.severity)}</span> ${esc(o.objection)}${o.answer ? `<br><small>Respuesta: ${esc(o.answer)}</small>` : ''}`)}</section>
<section><h2>Preguntas de usuarios</h2>${li(p.faq_external, (q) => `<strong>${esc(q.q)}</strong><br>${esc(q.a)}`)}</section>
<section><h2>Preguntas internas</h2>${li(p.faq_internal, (q) => `<strong>${esc(q.q)}</strong><br>${esc(q.a)}`)}</section>
</div>

<section><h2>Ángulos</h2><ul class="lenses">${lensRows}</ul>${arr(i.open_questions).length ? `<h3>Preguntas abiertas</h3>${li(i.open_questions, (q) => `${esc(q.q)}${q.blocking ? ' <strong>(bloquea)</strong>' : ''}`)}` : ''}</section>
</main></body></html>
`;
}

function renderMd(i, ev) {
  const m = i.market || {}, p = i.prfaq || {};
  const L = (a, f = (x) => x) => (arr(a).length ? arr(a).map((x) => `- ${f(x)}`).join('\n') : '- (sin completar)');
  const comp = [...arr(m.competitors), ...arr(m.alternatives)];
  return [`# ${i.title || i.slug}`, '', `${i.pitch || ''}`, '', `Estado: ${i.status} · ${ev.covered} de ${ev.total} ángulos cubiertos${i.decision ? ` · Decisión: **${i.decision.value}** (${i.decision.reason}, ${i.decision.at})` : ''}`, '',
    '## Si existiera hoy', '', `**${p.headline || ''}**`, '', p.subheadline || '', '', p.problem || '', '', p.solution || '', p.customer_quote ? `\n> ${p.customer_quote}` : '', '',
    '## Problema', '', i.problem.statement || '', '', `- Quién: ${i.problem.who || ''}`, `- Trabajo a resolver: ${i.problem.jtbd || ''}`, `- Hoy: ${i.problem.current_alternative || ''}`, '', 'Evidencia:', '', L(i.problem.pain_evidence, (e) => `${e.claim} (${e.source})`), '',
    '## Propuesta', '', i.value.proposition || '', '', `Diferencia: ${i.value.differentiation || ''}`, '', 'Usuarios:', '', L(i.users, (u) => `**${u.segment}**: ${u.need}`), '',
    '## Mercado', '', `Veredicto: ${m.verdict || '(sin definir)'}${m.checked_at ? ` (buscado el ${m.checked_at})` : ''}${m.unavailable_reason ? ` · ${m.unavailable_reason}` : ''}`, '',
    comp.length ? ['| Nombre | Qué hace | Precio | Hueco |', '|---|---|---|---|', ...comp.map((c) => `| ${url(c.url) ? `[${c.name}](${c.url})` : c.name} | ${String(c.what || '').replace(/\|/g, '/')} | ${c.price || ''} | ${String(c.gap || '').replace(/\|/g, '/')} |`)].join('\n') : '(sin relevar)', '',
    'Señales de demanda:', '', L(m.demand_signals, (s) => `${s.claim} — ${s.url}${s.date ? ` (${s.date})` : ''}`), '',
    '## Negocio', '', `${i.business.model || ''}`, '', `Precio o costo-beneficio: ${i.business.pricing_hypothesis || i.business.cost_benefit || ''}`, '',
    '## Factibilidad', '', i.feasibility.approach || '', '', 'No se sabe todavía:', '', L(i.feasibility.unknowns), '',
    '## Alcance mínimo', '', `Apetito: ${i.mvp.appetite || ''}`, '', 'Entra:', '', L(i.mvp.in), '', 'Queda afuera:', '', L(i.mvp.out), '',
    '## Métricas', '', `- Estrella: ${i.metrics.north_star || ''}`, `- Éxito si: ${i.metrics.success_criteria || ''}`, '', 'Se abandona si:', '', L(i.kill_criteria), '',
    '## Riesgos', '', L(i.risks, (r) => `**${kindOf(r.kind)}**: ${r.risk}. Mitigación: ${r.mitigation}`), '',
    '## Pre-mortem', '', L(i.premortem), '',
    '## Supuestos', '', L(i.assumptions, (a) => `${a.text}. Prueba: ${a.test} (${a.status || 'sin-probar'})`), '',
    '## Objeciones', '', L(i.skeptic.objections, (o) => `[${o.severity}] ${o.objection}${o.answer ? ` → ${o.answer}` : ''}`), '',
    '## Preguntas', '', L([...arr(p.faq_external), ...arr(p.faq_internal)], (q) => `**${q.q}** ${q.a}`), '',
    '## Ángulos pendientes', '', ev.lenses.filter((l) => !l.ok).map((l) => `- ${l.name}: ${l.missing.join('; ')}`).join('\n') || '- Ninguno', ''].join('\n');
}

function main() {
  const cmd = argv[0];
  const R = root();
  if (cmd === 'new') {
    const title = argv[1];
    if (!str(title, 3) || title.startsWith('--')) fail('Uso: idea.cjs new "<título>" [--slug <slug>]');
    const slug = get('--slug') || slugify(title);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(`Slug inválido: "${slug}". Minúsculas, números y guiones.`);
    const f = fileOf(slug, R);
    if (fs.existsSync(f)) fail(`La idea "${slug}" ya existe: ${path.relative(R, f)}`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(skeleton(title, slug), null, 2) + '\n');
    console.log(`Idea creada: ${path.relative(R, f)}`);
    return;
  }
  if (cmd === 'status') {
    const d = ideasDir(R);
    const list = fs.existsSync(d) ? fs.readdirSync(d).filter((s) => fs.existsSync(path.join(d, s, 'idea.json'))) : [];
    const rows = list.map((s) => { try { const i = JSON.parse(fs.readFileSync(path.join(d, s, 'idea.json'), 'utf8')); const e = evaluate(i, R); return { slug: s, title: i.title, status: i.status, covered: e.covered, total: e.total, decision: i.decision && i.decision.value }; } catch { return { slug: s, status: 'json inválido' }; } });
    if (has('--json')) { console.log(JSON.stringify(rows, null, 2)); return; }
    if (!rows.length) { console.log('No hay ideas todavía. Empezá con /idea-lab:shape <idea>.'); return; }
    for (const r of rows) console.log(`${r.slug.padEnd(28)} ${String(r.status).padEnd(12)} ${r.total ? `${r.covered}/${r.total} ángulos` : ''}${r.decision ? ` · decisión: ${r.decision}` : ''}`);
    return;
  }
  const slug = argv[1];
  if (!slug || slug.startsWith('--')) fail('Falta el slug de la idea. Mirá las que hay con: idea.cjs status');
  const { idea, f } = load(slug, R);
  if (cmd === 'check') {
    const e = evaluate(idea, R);
    if (has('--json')) console.log(JSON.stringify(e, null, 2));
    else {
      console.log(`${e.ready ? 'DEFINIDA' : 'INCOMPLETA'}: ${e.covered} de ${e.total} ángulos cubiertos.`);
      for (const l of e.lenses.filter((x) => !x.ok)) console.log(`- ${l.name}:\n    ${l.missing.join('\n    ')}`);
    }
    process.exit(e.ready ? 0 : 1);
  }
  if (cmd === 'render') {
    const e = evaluate(idea, R);
    const dir = path.dirname(f);
    fs.writeFileSync(path.join(dir, 'IDEA.md'), renderMd(normalize(idea), e));
    fs.writeFileSync(path.join(dir, 'preview.html'), renderHtml(normalize(idea), e));
    console.log(`${path.relative(R, path.join(dir, 'IDEA.md'))} · ${path.relative(R, path.join(dir, 'preview.html'))} (${e.covered}/${e.total} ángulos)`);
    return;
  }
  if (cmd === 'decide') {
    const value = argv[2];
    const reason = get('--reason');
    if (!['avanzar', 'pivotear', 'descartar'].includes(value)) fail('Uso: idea.cjs decide <slug> avanzar|pivotear|descartar --reason "<motivo>"');
    if (!str(reason, 10)) fail('Falta el motivo (--reason, 10+ caracteres): la decisión queda escrita para quien la lea después.');
    if (value === 'avanzar') { const e = evaluate(idea, R); if (!e.ready) fail(`No se puede avanzar: faltan ${e.total - e.covered} ángulo(s). Corré idea.cjs check ${slug}.`); }
    idea.decision = { value, reason: reason.trim(), at: today(), by: 'persona' };
    idea.status = { avanzar: 'definida', pivotear: 'en-analisis', descartar: 'descartada' }[value];
    idea.log = [...arr(idea.log), { at: today(), what: `decisión: ${value} — ${reason.trim()}` }];
    idea.updated = today();
    fs.writeFileSync(f, JSON.stringify(idea, null, 2) + '\n');
    console.log(`Decisión registrada: ${value}. Estado: ${idea.status}.${value === 'avanzar' ? ` Siguiente: /idea-lab:plan ${slug}` : ''}`);
    return;
  }
  fail('Uso: idea.cjs new|status|check|render|decide (ver encabezado)', 2);
}

if (require.main === module) main();
module.exports = { evaluate, normalize, skeleton, LENSES, slugify, renderHtml };
