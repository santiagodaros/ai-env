#!/usr/bin/env node
// Tarjeta de entrega (implementador) y veredicto (auditor): validación, extracción, verificación y formato.
// Uso:
//   node card.cjs check <archivo|-> [--verdict]          valida contra el esquema
//   node card.cjs extract <salida-de-claude.json> [--out f] [--verdict]
//                                                        saca structured_output (claude -p --json-schema) o el bloque ```json final
//   node card.cjs verify <archivo> [--base main] [--run-tests]
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
  if (c.risks && c.risks.length) L.push('', '### Riesgos', '', ...c.risks.map((r) => `- ${r}`));
  if (c.followups && c.followups.length) L.push('', '### Pendientes para otro ticket', '', ...c.followups.map((r) => `- ${r}`));
  L.push('', '### Archivos', '', ...c.files_changed.map((f) => `- \`${f}\``));
  return L.join('\n') + '\n';
}

function verify(c, { base = 'main', runTests = false, cwd = process.cwd() } = {}) {
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
      const issues = verify(c, { base: get('--base') || 'main', runTests: argv.includes('--run-tests') });
      if (issues.length) { console.log(`La tarjeta no coincide con el repo:\n- ${issues.join('\n- ')}`); process.exit(1); }
      console.log('La tarjeta coincide con el repo.');
    } else if (cmd === 'render') {
      process.stdout.write(render(JSON.parse(read(file)), verdict));
    } else throw new Error(`Comando desconocido: ${cmd}`);
  } catch (e) { console.error(e.message); process.exit(e instanceof SyntaxError ? 2 : 1); }
}

module.exports = { validate, extract, render, verify, schemaPath: (verdict) => path.join(SCHEMAS, verdict ? 'verdict.schema.json' : 'card.schema.json') };
