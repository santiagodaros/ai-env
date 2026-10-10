#!/usr/bin/env node
// El PRD como fuente de verdad, en rebanadas. Ningún worker recibe el PRD completo: recibe la sección de su ticket.
// Uso:
//   node prd.cjs list   [--prd docs/PRD.md] [--json]
//   node prd.cjs slice  <ID> [--prd ...] [--out archivo.md] [--json]
//   node prd.cjs check  [--prd ...]
//   node prd.cjs init   [--prd ...]          (crea el esqueleto si no existe)
// Formato: cada requerimiento es un encabezado con id estable: "## [F-03] Exportar costos" (también "### F-03 - ...").
// Prefijos: G = global (restricciones, stack: va en TODAS las rebanadas), F = funcional, NF = no funcional, o los que uses.
// La rebanada lleva: la sección pedida, las secciones G-*, las secciones que esa cita por id (un nivel) y las
// decisiones de los ADR citados (docs/decisions/NNNN-*.md). Es determinista: no resume ni inventa.
'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../../../lib/config.cjs');

const HEAD = /^(#{1,6})\s+\[?([A-Z]{1,4}-\d{1,4})\]?(?:\s*[:.\-–—·]\s*|\s+)(.+?)\s*$/;
const REF = /\b([A-Z]{1,4}-\d{1,4})\b/g;
const ADR_REF = /\bADR[- ]?(\d{1,4})\b/gi;
const noCode = (t) => t.replace(/```[\s\S]*?```/g, '');
const refsOf = (t) => [...new Set([...noCode(t).matchAll(REF)].map((m) => m[1]))].filter((r) => !/^ADR-/i.test(r));

function parse(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const secs = [];
  let cur = null, inCode = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) inCode = !inCode;
    const h = !inCode && l.match(/^(#{1,6})\s/);
    if (h) {
      const level = h[1].length;
      // Cierra secciones del mismo nivel o superior.
      for (const s of secs) if (s.end === null && s.level >= level) s.end = i;
      const m = l.match(HEAD);
      if (m) { cur = { id: m[2], level, title: m[3], start: i, end: null }; secs.push(cur); }
    }
  });
  for (const s of secs) if (s.end === null) s.end = lines.length;
  for (const s of secs) {
    s.text = lines.slice(s.start, s.end).join('\n').trim();
    s.line = s.start + 1;
    s.criteria = (s.text.match(/^\s*[-*]\s+\[[ xX]\]\s+.+$/gm) || []).map((x) => x.replace(/^\s*[-*]\s+\[[ xX]\]\s+/, '').trim());
  }
  return { lines, secs };
}

function load(prdPath) {
  if (!fs.existsSync(prdPath)) throw new Error(`No existe ${prdPath}. Creá el esqueleto con: node prd.cjs init`);
  return parse(fs.readFileSync(prdPath, 'utf8'));
}

function adrDecision(root, n) {
  const dir = path.join(root, 'docs', 'decisions');
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find((x) => x.startsWith(String(n).padStart(4, '0') + '-'));
  if (!f) return null;
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  const title = (t.match(/^#\s*(ADR-\d{4}:.+)$/m) || [])[1] || f;
  const state = (t.match(/^Estado:\s*(.+)$/m) || [])[1] || '';
  const at = t.search(/^##\s*Decisi[oó]n\s*$/m);
  let dec = '';
  if (at >= 0) { const body = t.slice(t.indexOf('\n', at) + 1); const next = body.search(/^##\s/m); dec = next >= 0 ? body.slice(0, next) : body; }
  return `### ${title}${state ? ` (${state.trim()})` : ''}\n${dec.trim() || '(sin sección "Decisión")'}\nArchivo: docs/decisions/${f}`;
}

function slice(root, prdRel, id) {
  const { secs } = load(path.join(root, prdRel));
  const byId = Object.fromEntries(secs.map((s) => [s.id, s]));
  const target = byId[id];
  if (!target) throw new Error(`No hay una sección con id ${id} en ${prdRel}. Ids: ${secs.map((s) => s.id).join(', ') || '(ninguno)'}`);
  // Una sección contiene a sus subsecciones con id: no se repiten como referencias.
  const inside = new Set(secs.filter((s) => s.start > target.start && s.end <= target.end).map((s) => s.id));
  const globals = secs.filter((s) => /^G-/.test(s.id) && s.id !== id && !inside.has(s.id));
  const refs = refsOf(target.text).filter((r) => r !== id && byId[r] && !inside.has(r) && !globals.some((g) => g.id === r)).map((r) => byId[r]);
  const missing = refsOf(target.text).filter((r) => !byId[r]);
  const adrs = [...new Set([...noCode([target, ...refs].map((s) => s.text).join('\n')).matchAll(ADR_REF)].map((m) => Number(m[1])))].map((n) => adrDecision(root, n) || `### ADR-${String(n).padStart(4, '0')}\n(no encontrado en docs/decisions/)`);
  const parts = [`<!-- prd-slice: ${id} de ${prdRel} -->`, `# Contexto del ticket: ${id} ${target.title}`, '', target.text];
  const blocks = (arr) => arr.flatMap((t, i) => (i ? ['', t] : [t]));
  if (globals.length) parts.push('', '## Restricciones globales (G-*)', '', ...blocks(globals.map((g) => g.text)));
  if (refs.length) parts.push('', '## Secciones citadas', '', ...blocks(refs.map((r) => r.text)));
  if (adrs.length) parts.push('', '## Decisiones de arquitectura citadas', '', ...blocks(adrs));
  if (missing.length) parts.push('', `> Aviso: la sección cita ids que no existen en el PRD: ${missing.join(', ')}.`);
  const text = parts.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  const full = fs.readFileSync(path.join(root, prdRel), 'utf8');
  return { id, title: target.title, criteria: target.criteria, refs: refs.map((r) => r.id), globals: globals.map((g) => g.id), adrs: adrs.length, missing, text, chars: text.length, prdChars: full.length };
}

function check(root, prdRel) {
  const { secs } = load(path.join(root, prdRel));
  const errors = [], warnings = [];
  const seen = {};
  for (const s of secs) { if (seen[s.id]) errors.push(`${s.id} repetido (líneas ${seen[s.id]} y ${s.line})`); else seen[s.id] = s.line; }
  for (const s of secs) {
    for (const r of refsOf(s.text)) if (!seen[r]) errors.push(`${s.id} cita ${r}, que no existe`);
    if (/^F-/.test(s.id) && !s.criteria.length) warnings.push(`${s.id} no tiene criterios de aceptación (casillas "- [ ] ...")`);
    if (s.text.length > 6000) warnings.push(`${s.id} tiene ${s.text.length} caracteres: partila (un ticket debería entrar en una rebanada chica)`);
  }
  if (!secs.length) errors.push('el PRD no tiene ninguna sección con id ("## [F-01] Título")');
  return { errors, warnings, sections: secs.length };
}

const SKELETON = `# PRD

Fuente de verdad del producto. Cada requerimiento tiene un id estable entre corchetes; los tickets y las ramas lo citan.
Las secciones G-* van en todas las rebanadas: mantenelas cortas.

## [G-01] Stack y comandos
- Lenguaje y framework: (completar)
- Comandos: build, lint y test (los mismos de CLAUDE.md)

## [G-02] Restricciones
- Seguridad: sin secretos en el código; validación de entrada en el borde; toda llamada externa con timeout.
- Datos: (completar)

## [NF-01] Calidad
- Cada cambio de código trae pruebas que fallan sin el cambio.

## [F-01] (Primer requerimiento)
Objetivo en una línea.

Detalle: (completar). Cumple G-02 y NF-01.

Criterios de aceptación:
- [ ] (comportamiento verificable)
- [ ] (otro)
`;

if (require.main === module) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const root = config.repoRoot(get('--dir') || process.cwd());
  const prdRel = get('--prd') || config.load(root).prd;
  try {
    if (cmd === 'list') {
      const { secs } = load(path.join(root, prdRel));
      if (argv.includes('--json')) console.log(JSON.stringify(secs.map(({ id, title, level, line, criteria }) => ({ id, title, level, line, criteria: criteria.length })), null, 2));
      else for (const s of secs) console.log(`${'  '.repeat(Math.max(0, s.level - 2))}${s.id}  ${s.title}  (línea ${s.line}${s.criteria.length ? `, ${s.criteria.length} criterio(s)` : ''})`);
    } else if (cmd === 'slice') {
      const id = argv[1];
      if (!id || !/^[A-Z]{1,4}-\d{1,4}$/.test(id)) throw new Error('Uso: node prd.cjs slice <ID>  (por ejemplo F-03)');
      const r = slice(root, prdRel, id);
      if (get('--out')) { fs.mkdirSync(path.dirname(path.resolve(get('--out'))), { recursive: true }); fs.writeFileSync(get('--out'), r.text); }
      if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
      else if (!get('--out')) process.stdout.write(r.text);
      if (!argv.includes('--json')) console.error(`Rebanada ${id}: ${r.chars} caracteres (${Math.round((100 * r.chars) / r.prdChars)} % del PRD); globales ${r.globals.join(', ') || '—'}; citadas ${r.refs.join(', ') || '—'}; ADR ${r.adrs}.${r.missing.length ? ` Cita ids inexistentes: ${r.missing.join(', ')}.` : ''}`);
    } else if (cmd === 'check') {
      const r = check(root, prdRel);
      for (const w of r.warnings) console.log(`AVISO ${w}`);
      for (const e of r.errors) console.log(`ERROR ${e}`);
      console.log(r.errors.length ? `${prdRel}: ${r.errors.length} error(es)` : `${prdRel}: ${r.sections} secciones, sin errores`);
      process.exit(r.errors.length ? 1 : 0);
    } else if (cmd === 'init') {
      const f = path.join(root, prdRel);
      if (fs.existsSync(f)) { console.log(`${prdRel} ya existe: no se toca.`); process.exit(0); }
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, SKELETON);
      console.log(`Creado ${prdRel} con el esqueleto (G-01, G-02, NF-01, F-01).`);
    } else {
      console.error('Uso: node prd.cjs list|slice <ID>|check|init [--prd ruta] [--json] [--out archivo]'); process.exit(2);
    }
  } catch (e) { console.error(e.message); process.exit(2); }
}

module.exports = { parse, slice, check, SKELETON };
