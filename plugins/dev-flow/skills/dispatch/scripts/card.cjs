#!/usr/bin/env node
// Tarjeta de entrega (implementador) y veredicto (auditor): validación, extracción, verificación y formato.
// Uso:
//   node card.cjs check <archivo|-> [--verdict]          valida contra el esquema
//   node card.cjs extract <salida-de-claude.json> [--out f] [--verdict]
//                                                        saca structured_output (claude -p --json-schema) o el bloque ```json final
//   node card.cjs verify <archivo> [--base main] [--run-tests] [--issue <N> | --scope a,b]
//                                                        con --issue o --scope, además: archivos fuera del Alcance sin
//                                                        justificar y cambios de solo formato
//                                                        contrasta la tarjeta con el repo: archivos reales vs declarados,
//                                                        comandos con error declarados como éxito, pruebas que no pasan
//   node card.cjs render <archivo> [--verdict]           markdown para el PR o un comentario
// Sale con 1 si la tarjeta no es válida o si verify encuentra contradicciones.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SCHEMAS = path.join(__dirname, '..', 'schemas');
const schema = (verdict) => JSON.parse(fs.readFileSync(path.join(SCHEMAS, verdict ? 'verdict.schema.json' : 'card.schema.json'), 'utf8'));

// Validador mínimo de JSON Schema: type, required, properties, additionalProperties:false, items, enum, minItems,
// minLength, maxLength, minimum. Alcanza para los dos esquemas de este plugin.
function check(v, s, at = '$') {
  const errs = [];
  const type = Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v;
  if (s.type && !(s.type === type || (s.type === 'number' && type === 'integer'))) return [`${at}: se esperaba ${s.type}, vino ${type}`];
  if (s.enum && !s.enum.includes(v)) errs.push(`${at}: "${v}" no es uno de ${s.enum.join(', ')}`);
  if (type === 'string') {
    if (s.minLength && v.trim().length < s.minLength) errs.push(`${at}: muy corto (mínimo ${s.minLength})`);
    if (s.maxLength && v.length > s.maxLength) errs.push(`${at}: muy largo (máximo ${s.maxLength})`);
  }
  if ((type === 'integer' || type === 'number') && s.minimum !== undefined && v < s.minimum) errs.push(`${at}: menor que ${s.minimum}`);
  if (type === 'array') {
    if (s.minItems && v.length < s.minItems) errs.push(`${at}: necesita al menos ${s.minItems} elemento(s)`);
    if (s.items) v.forEach((x, i) => errs.push(...check(x, s.items, `${at}[${i}]`)));
  }
  if (type === 'object') {
    for (const k of s.required || []) if (!(k in v)) errs.push(`${at}: falta "${k}"`);
    for (const [k, x] of Object.entries(v)) {
      if (s.properties && s.properties[k]) errs.push(...check(x, s.properties[k], `${at}.${k}`));
      else if (s.additionalProperties === false) errs.push(`${at}: campo no permitido "${k}"`);
    }
  }
  return errs;
}
const validate = (obj, verdict = false) => check(obj, schema(verdict));

// La salida de `claude -p --output-format json` trae structured_output cuando se usó --json-schema.
// Sin esquema, se toma el último bloque ```json del texto final.
function extract(raw) {
  let j; try { j = JSON.parse(raw); } catch { j = null; }
  if (j && j.structured_output && typeof j.structured_output === 'object') return j.structured_output;
  const text = j && typeof j.result === 'string' ? j.result : raw;
  const blocks = [...String(text).matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (blocks.length) return JSON.parse(blocks[blocks.length - 1][1]);
  if (j && !j.result && !j.structured_output) return j; // ya era la tarjeta
  throw new Error('No encontré la tarjeta: ni structured_output ni un bloque ```json en la respuesta.');
}

function render(c, verdict = false) {
  if (verdict) {
    const L = [`### Auditoría: **${c.verdict.toUpperCase()}**`, '', c.summary, '', `Pruebas honestas: ${c.tests_honest}`, '', '| Chequeo | Resultado | Detalle |', '|---|---|---|', ...c.checks.map((k) => `| ${k.name} | ${k.result} | ${(k.detail || '').replace(/\|/g, '/')} |`)];
    if (c.findings.length) L.push('', '| Sev. | Área | Dónde | Problema | Corrección |', '|---|---|---|---|---|', ...c.findings.map((f) => `| ${f.severity} | ${f.area} | ${f.where} | ${f.issue.replace(/\|/g, '/')} | ${f.fix.replace(/\|/g, '/')} |`));
    return L.join('\n') + '\n';
  }
  const L = ['## Tarjeta de entrega', '', `Ticket #${c.ticket} · rama \`${c.branch}\``, '', '### Comandos ejecutados', '', '| Comando | Salida |', '|---|---|', ...c.commands.map((x) => `| \`${x.cmd.replace(/\|/g, '\\|')}\` | ${x.exit === 0 ? 'ok' : `código ${x.exit}`}${x.note ? ` (${x.note})` : ''} |`)];
  L.push('', '### Pruebas', '', `- Comando: \`${c.tests.command}\` → ${c.tests.passed ? 'pasan' : '**fallan**'}`, `- Nuevas o cambiadas: ${c.tests.added.length ? c.tests.added.map((t) => `\`${t}\``).join(', ') : 'ninguna'}`, `- Fallan sin el cambio: ${c.tests.fail_without_change}`);
  L.push('', '### Criterios de aceptación', '', ...c.acceptance.map((a) => `- [${a.status === 'cumple' ? 'x' : ' '}] ${a.criterion} — **${a.status}**: ${a.evidence}`));
  L.push('', '### Puntos ciegos (no verificados)', '', ...c.blind_spots.map((b) => `- ${b}`));
  if (c.decisions && c.decisions.length) L.push('', '### Decisiones', '', ...c.decisions.map((d) => `- ${d.decision} (${d.reason})`));
  if (c.risks && c.risks.length) L.push('', '### Riesgos', '', ...c.risks.map((r) => `- ${r}`));
  if (c.followups && c.followups.length) L.push('', '### Pendientes para otro ticket', '', ...c.followups.map((r) => `- ${r}`));
  if (c.scope_extensions && c.scope_extensions.length) L.push('', '### Fuera del Alcance, justificado', '', ...c.scope_extensions.map((e) => `- \`${e.file}\`: ${e.reason}`));
  if (c.noticed_out_of_scope && c.noticed_out_of_scope.length) L.push('', '### Visto y no tocado (fuera del Alcance)', '', ...c.noticed_out_of_scope.map((e) => `- ${e.where}: ${e.what}`));
  L.push('', '### Archivos', '', ...c.files_changed.map((f) => `- \`${f}\``));
  return L.join('\n') + '\n';
}

// Alcance del ticket: la sección "## Alcance" del issue (rutas exactas, carpetas o `carpeta/**`).
// Fuera del alcance solo vale lo que la tarjeta justifica en scope_extensions; el resumen del ticket y el changelog no cuentan.
const EXEMPT = /^(docs\/tickets\/|\.dev-flow\/|docs\/CHANGELOG\.md$|CHANGELOG\.md$)/;
const norm = (f) => String(f).replace(/\\/g, '/').replace(/^\.\//, '');
function scopeFromBody(body) {
  const lines = String(body || '').split('\n');
  const i = lines.findIndex((l) => /^##\s+Alcance/i.test(l));
  if (i < 0) return [];
  const j = lines.slice(i + 1).findIndex((l) => /^##\s/.test(l) || /^---\s*$/.test(l));
  return [...lines.slice(i + 1, j < 0 ? undefined : i + 1 + j).join('\n').matchAll(/^\s*-\s+`?([^`\s(][^`\s]*)`?/gm)].map((m) => norm(m[1]));
}
const inScope = (f, scope) => scope.some((s) => { const d = s.replace(/\/?\*+$/, ''); return f === s || f === d || f.startsWith(d.replace(/\/$/, '') + '/'); });
function outOfScope(files, scope, c) {
  if (!scope || !scope.length) return [];
  const ext = new Set(((c && c.scope_extensions) || []).map((e) => norm(e.file)));
  return files.map(norm).filter((f) => !EXEMPT.test(f) && !inScope(f, scope) && !ext.has(f));
}

function verify(c, { base = 'main', runTests = false, cwd = process.cwd(), scope = [] } = {}) {
  const issues = [];
  const git = (a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  const mb = git(['merge-base', base, 'HEAD']);
  if (mb.status !== 0) issues.push(`no pude calcular la base contra ${base}: no se verificaron los archivos`);
  else {
    const real = new Set(git(['diff', '--name-only', `${mb.stdout.trim()}...HEAD`]).stdout.split('\n').map((x) => x.trim()).filter(Boolean));
    const said = new Set(c.files_changed.map((f) => f.replace(/\\/g, '/').replace(/^\.\//, '')));
    const notDeclared = [...real].filter((f) => !said.has(f));
    const notReal = [...said].filter((f) => !real.has(f));
    if (notDeclared.length) issues.push(`archivos cambiados que la tarjeta no declara: ${notDeclared.slice(0, 8).join(', ')}`);
    if (notReal.length) issues.push(`archivos declarados que no cambiaron en la rama: ${notReal.slice(0, 8).join(', ')}`);
    const out = outOfScope([...real], scope, c);
    if (out.length) issues.push(`archivos fuera del Alcance del ticket sin justificar en scope_extensions: ${out.slice(0, 8).join(', ')}`);
    // Cambios de solo formato (espacios, sangría, saltos): inflan el diff sin cambiar nada. Se comparan los conteos con y sin -w.
    const ns = (extra) => Object.fromEntries(git(['diff', '--numstat', ...extra, `${mb.stdout.trim()}...HEAD`]).stdout.split('\n').filter(Boolean).map((l) => { const [a, d, f] = l.split('\t'); return [norm(f), (Number(a) || 0) + (Number(d) || 0)]; }));
    const all = ns([]), sem = ns(['-w', '--ignore-blank-lines']);
    const ext = new Set((c.scope_extensions || []).map((e) => norm(e.file)));
    const churn = Object.entries(all).filter(([f, n]) => !ext.has(f) && n - (sem[f] || 0) >= 10 && (n - (sem[f] || 0)) / n > 0.5).map(([f, n]) => `${f} (${n - (sem[f] || 0)} de ${n} líneas)`);
    if (churn.length) issues.push(`cambios de solo formato (espacios, sangría o líneas en blanco), fuera de lo que pide el ticket: ${churn.slice(0, 5).join(', ')}. Revertilos o justificalos en scope_extensions`);
    const br = git(['branch', '--show-current']).stdout.trim();
    if (br && br !== c.branch) issues.push(`la tarjeta dice rama ${c.branch} y estás en ${br}`);
  }
  if (c.tests.passed && c.commands.some((x) => x.cmd.trim() === c.tests.command.trim() && x.exit !== 0)) issues.push('declara pruebas que pasan, pero el mismo comando figura con salida distinta de 0');
  if (c.acceptance.some((a) => a.status === 'cumple' && /^(ok|si|sí|listo|hecho|n\/a|-)$/i.test(a.evidence.trim()))) issues.push('hay criterios "cumple" sin evidencia concreta (comando, prueba o archivo:línea)');
  if (c.blind_spots.some((b) => /^ningun[oa]\.?$/i.test(b.trim()))) issues.push('"ninguno" no es un punto ciego: decí qué no se verificó (o por qué no hay nada sin verificar)');
  if (runTests) {
    const r = spawnSync(c.tests.command, { cwd, encoding: 'utf8', shell: true, timeout: 15 * 60000 });
    if ((r.status === 0) !== c.tests.passed) issues.push(`al correr "${c.tests.command}" las pruebas ${r.status === 0 ? 'pasan' : 'fallan'} y la tarjeta dice lo contrario`);
  }
  return issues;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const [cmd, file] = argv;
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const verdict = argv.includes('--verdict');
  const read = (f) => (f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8'));
  try {
    if (!file) throw new Error('Uso: node card.cjs check|extract|verify|render <archivo> [--verdict]');
    if (cmd === 'check') {
      const errs = validate(JSON.parse(read(file)), verdict);
      if (errs.length) { console.log(`${verdict ? 'Veredicto' : 'Tarjeta'} inválida:\n- ${errs.join('\n- ')}`); process.exit(1); }
      console.log(`${verdict ? 'Veredicto' : 'Tarjeta'} válida.`);
    } else if (cmd === 'extract') {
      const obj = extract(read(file));
      const errs = validate(obj, verdict);
      const out = JSON.stringify(obj, null, 2) + '\n';
      if (get('--out')) { fs.mkdirSync(path.dirname(path.resolve(get('--out'))), { recursive: true }); fs.writeFileSync(get('--out'), out); }
      else process.stdout.write(out);
      if (errs.length) { console.error(`Extraída pero inválida:\n- ${errs.join('\n- ')}`); process.exit(1); }
    } else if (cmd === 'verify') {
      const c = JSON.parse(read(file));
      const errs = validate(c);
      if (errs.length) { console.log(`Tarjeta inválida:\n- ${errs.join('\n- ')}`); process.exit(1); }
      let scope = get('--scope') ? get('--scope').split(',').map((x) => x.trim()).filter(Boolean) : [];
      if (!scope.length && get('--issue')) {
        try { scope = scopeFromBody(require('../../../lib/gh.cjs').ghJson(['issue', 'view', String(get('--issue')), '--json', 'body']).body); } catch { console.error(`No pude leer el Alcance del issue #${get('--issue')}: no se verificó el alcance.`); }
      }
      const issues = verify(c, { base: get('--base') || 'main', runTests: argv.includes('--run-tests'), scope });
      if (issues.length) { console.log(`La tarjeta no coincide con el repo:\n- ${issues.join('\n- ')}`); process.exit(1); }
      console.log('La tarjeta coincide con el repo.');
    } else if (cmd === 'render') {
      process.stdout.write(render(JSON.parse(read(file)), verdict));
    } else throw new Error(`Comando desconocido: ${cmd}`);
  } catch (e) { console.error(e.message); process.exit(e instanceof SyntaxError ? 2 : 1); }
}

module.exports = { validate, extract, render, verify, scopeFromBody, outOfScope, schemaPath: (verdict) => path.join(SCHEMAS, verdict ? 'verdict.schema.json' : 'card.schema.json') };
