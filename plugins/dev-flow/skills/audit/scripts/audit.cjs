#!/usr/bin/env node
// Revisión adversarial determinista de una rama contra su base: lo que el auditor no debería tener que buscar a mano.
// Uso: node audit.cjs [--base main] [--no-honesty] [--test "npm test"] [--json] [--out f.json]
// Mira solo las líneas agregadas del diff:
//   - timeout: llamadas externas sin timeout (fetch, axios, http/https, requests, HttpClient, Invoke-RestMethod)
//   - inyeccion: SQL armado con concatenación o interpolación, exec/eval con datos, Invoke-Expression, innerHTML
//   - esquema: cuerpo de request o JSON.parse sin validación de esquema en el archivo
//   - tests: .only, .skip, aserciones triviales, pruebas sin aserciones, mock del propio módulo bajo prueba
// Más el escáner de seguridad del plugin (secretos, TLS desactivado, archivos sensibles) y la prueba de honestidad (las pruebas tienen que fallar sin el cambio).
// Sale con 1 si hay P0, 0 si no. No reemplaza el juicio del auditor: le deja la evidencia.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../../../lib/config.cjs');
const { TEST } = require('../../feature-close/scripts/gates.cjs');
const honesty = require('./test-honesty.cjs');

const VALIDATION = /\b(zod|z\.object|joi|yup|ajv|valibot|superstruct|class-validator|pydantic|BaseModel|marshmallow|jsonschema|FluentValidation|DataAnnotations|typebox|io-ts|schema\.parse|safeParse|\.validate\()/;

function addedLines(root, baseSha) {
  const r = spawnSync('git', ['diff', '-U0', '--no-color', `${baseSha}...HEAD`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const files = {};
  let file = null, line = 0;
  for (const l of r.stdout.split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, ''); if (file === '/dev/null') file = null; continue; }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { line = Number(h[1]); continue; }
    if (!file) continue;
    if (l.startsWith('+') && !l.startsWith('+++')) { (files[file] = files[file] || []).push({ n: line, t: l.slice(1) }); line++; }
  }
  return files;
}

const RULES = [
  // [id, área, severidad, regex sobre la línea, condición de exención sobre el bloque cercano, texto, corrección]
  ['fetch-sin-timeout', 'timeout', 'P1', /\bfetch\s*\(/, /signal|timeout|AbortSignal/i, 'fetch sin timeout ni AbortSignal', 'fetch(url, { signal: AbortSignal.timeout(10_000) })'],
  ['axios-sin-timeout', 'timeout', 'P1', /\baxios(?:\.(?:get|post|put|patch|delete|request))?\s*\(/, /timeout/i, 'axios sin timeout', 'timeout en la llamada o en axios.create({ timeout })'],
  ['http-sin-timeout', 'timeout', 'P1', /\bhttps?\.(?:request|get)\s*\(/, /timeout|setTimeout/i, 'http(s).request sin timeout', 'req.setTimeout(ms, () => req.destroy())'],
  ['requests-sin-timeout', 'timeout', 'P1', /\brequests\.(?:get|post|put|patch|delete|request)\s*\(/, /timeout\s*=/, 'requests sin timeout=', 'requests.get(url, timeout=10)'],
  ['httpclient-sin-timeout', 'timeout', 'P2', /new\s+HttpClient\s*\(/, /Timeout/, 'HttpClient sin Timeout explícito', 'client.Timeout = TimeSpan.FromSeconds(10) o IHttpClientFactory con política'],
  ['ps-web-sin-timeout', 'timeout', 'P1', /\b(?:Invoke-RestMethod|Invoke-WebRequest|irm|iwr)\b/i, /-TimeoutSec/i, 'Invoke-RestMethod/WebRequest sin -TimeoutSec', '-TimeoutSec 30'],
  ['sql-concatenado', 'inyeccion', 'P0', /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^;\n]*(?:\$\{|["'`]\s*\+\s*\w|\+\s*["'`]|f["'][^"']*\{|\.format\(|%s["']\s*%)/i, null, 'SQL armado con concatenación o interpolación', 'consulta parametrizada o el query builder del ORM'],
  ['exec-con-datos', 'inyeccion', 'P0', /\b(?:exec|execSync|spawnSync|spawn)\s*\(\s*`[^`]*\$\{|os\.system\s*\(|subprocess\.\w+\([^)]*shell\s*=\s*True/, null, 'comando de sistema armado con datos', 'spawn con lista de argumentos y sin shell'],
  ['eval', 'inyeccion', 'P0', /\beval\s*\(|new\s+Function\s*\(|\bInvoke-Expression\b|\biex\s+\$/, null, 'eval / new Function / Invoke-Expression', 'eliminarlo: parsear datos, no ejecutarlos'],
  ['html-sin-escape', 'inyeccion', 'P1', /dangerouslySetInnerHTML|\.innerHTML\s*=\s*(?!['"`]\s*['"`])/, /DOMPurify|sanitize/i, 'HTML insertado sin sanitizar', 'textContent, o sanitizar con DOMPurify'],
];

function scan(root, files) {
  const out = [];
  for (const [file, lines] of Object.entries(files)) {
    const isTest = TEST.test(file);
    let fullText = '';
    try { fullText = fs.readFileSync(path.join(root, file), 'utf8'); } catch { /* borrado o binario */ }
    if (!isTest) {
      lines.forEach((ln, i) => {
        const near = lines.slice(Math.max(0, i - 2), i + 4).map((x) => x.t).join('\n');
        for (const [id, area, sev, re, exempt, issue, fix] of RULES) if (re.test(ln.t) && !(exempt && exempt.test(near))) out.push({ id, area, severity: sev, where: `${file}:${ln.n}`, issue, fix });
        if (/\breq(?:uest)?\.body\b|\bawait\s+request\.json\(\)|JSON\.parse\s*\(\s*(?:req|request|body|event)/.test(ln.t) && !VALIDATION.test(fullText)) out.push({ id: 'sin-validacion', area: 'esquema', severity: 'P1', where: `${file}:${ln.n}`, issue: 'datos de entrada usados sin validación de esquema en el archivo', fix: 'validar en el borde (zod, pydantic, FluentValidation…) y rechazar lo que no cumple' });
      });
    } else {
      const added = lines.map((x) => x.t).join('\n');
      for (const ln of lines) {
        if (/\b(?:it|test|describe)\.only\s*\(|\bfit\s*\(|\bfdescribe\s*\(/.test(ln.t)) out.push({ id: 'test-only', area: 'tests', severity: 'P0', where: `${file}:${ln.n}`, issue: '.only deja afuera el resto de la suite', fix: 'sacar .only' });
        if (/\b(?:it|test|describe)\.(?:skip|todo)\s*\(|\bx(?:it|describe|test)\s*\(|@pytest\.mark\.skip|\[Ignore\]|\bSkip\s*=/.test(ln.t)) out.push({ id: 'test-skip', area: 'tests', severity: 'P1', where: `${file}:${ln.n}`, issue: 'prueba salteada', fix: 'implementarla o sacarla con un motivo en el ticket' });
        if (/expect\(\s*(?:true|1|false)\s*\)\.(?:toBe|toEqual)\(\s*(?:true|1|false)\s*\)|assert(?:\.ok)?\s*\(\s*true\s*\)|assert\s+True\b|Assert\.True\(\s*true\s*\)/.test(ln.t)) out.push({ id: 'asercion-trivial', area: 'tests', severity: 'P1', where: `${file}:${ln.n}`, issue: 'aserción que siempre pasa', fix: 'afirmar sobre el resultado real' });
      }
      const nTests = (added.match(/\b(?:it|test)\s*\(|\bdef\s+test_|\[(?:Fact|Test|TestMethod)\]|\bIt\s+["']/g) || []).length;
      const nAsserts = (added.match(/\bexpect\s*\(|\bassert|\bAssert\.|\bshould\b|\bShould\b|toThrow|rejects/g) || []).length;
      if (nTests && !nAsserts) out.push({ id: 'sin-aserciones', area: 'tests', severity: 'P1', where: file, issue: `${nTests} prueba(s) nuevas sin ninguna aserción`, fix: 'cada prueba afirma algo del comportamiento' });
      if (nAsserts && (added.match(/toMatchSnapshot|toMatchInlineSnapshot/g) || []).length === nAsserts) out.push({ id: 'solo-snapshots', area: 'tests', severity: 'P2', where: file, issue: 'las pruebas nuevas son solo snapshots', fix: 'al menos una aserción explícita del comportamiento pedido' });
      for (const m of added.matchAll(/\b(?:jest|vi)\.mock\(\s*['"]([^'"]+)['"]/g)) {
        const mod = path.basename(m[1]).replace(/\.\w+$/, '');
        const tested = path.basename(file).replace(/\.(test|spec)\.\w+$/, '');
        if (mod && mod === tested) out.push({ id: 'mock-del-sujeto', area: 'tests', severity: 'P1', where: file, issue: `mockea "${m[1]}", el mismo módulo que prueba`, fix: 'mockear solo los bordes (red, disco, reloj), no la unidad bajo prueba' });
      }
    }
  }
  return out;
}

function audit({ root, base = 'main', test, honestyOn = true }) {
  const mb = spawnSync('git', ['merge-base', base, 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (mb.status !== 0) throw new Error(`No pude calcular la base contra ${base}. ¿Existe la rama? (git fetch origin ${base})`);
  const files = addedLines(root, mb.stdout.trim());
  const findings = scan(root, files);
  const checks = [];
  // Escáner de seguridad del plugin (secretos, archivos sensibles, dependencias…)
  const sc = path.join(__dirname, '..', '..', 'security-diff', 'scripts', 'secscan.cjs');
  if (fs.existsSync(sc)) {
    const r = spawnSync(process.execPath, [sc, '--range', `${mb.stdout.trim()}..HEAD`, '--json'], { cwd: root, encoding: 'utf8' });
    try {
      const j = JSON.parse(r.stdout || '{}');
      for (const f of j.high || []) findings.push({ id: f.id, area: 'seguridad', severity: 'P0', where: `${f.file}:${f.line}`, issue: f.msg, fix: 'ver security-diff' });
      for (const f of j.medium || []) findings.push({ id: f.id, area: 'seguridad', severity: 'P2', where: `${f.file}:${f.line}`, issue: f.msg, fix: 'revisar' });
      checks.push({ name: 'secscan', result: (j.high || []).length ? 'falla' : 'pasa', detail: `${(j.high || []).length} alto(s), ${(j.medium || []).length} medio(s)` });
    } catch { checks.push({ name: 'secscan', result: 'no-verificado', detail: 'no devolvió JSON' }); }
  }
  let h = { result: 'NO-APLICA', detail: 'desactivada con --no-honesty' };
  if (honestyOn) h = honesty.run({ root, base, test });
  const map = { PASA: 'pasa', FALLA: 'falla', 'NO-APLICA': 'no-aplica', ERROR: 'no-verificado' };
  checks.push({ name: 'honestidad de las pruebas', result: map[h.result], detail: h.detail });
  if (h.result === 'FALLA') findings.push({ id: 'pruebas-complacientes', area: 'tests', severity: 'P0', where: (h.code || []).slice(0, 3).join(', '), issue: h.detail, fix: 'agregar pruebas que fallen sin el cambio (probá sacándolo)' });
  const p0 = findings.filter((f) => f.severity === 'P0').length;
  checks.unshift({ name: 'revisión del diff', result: p0 ? 'falla' : 'pasa', detail: `${Object.keys(files).length} archivo(s), ${findings.length} hallazgo(s)` });
  return { base, files: Object.keys(files), findings, checks, tests_honest: h.result === 'PASA' ? 'si' : h.result === 'FALLA' ? 'no' : 'no-verificado', suggested: p0 ? 'bloquear' : findings.some((f) => f.severity === 'P1') ? 'cambios' : 'aprobar' };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const r = audit({ root: config.repoRoot(process.cwd()), base: get('--base') || 'main', test: get('--test'), honestyOn: !argv.includes('--no-honesty') });
    if (get('--out')) fs.writeFileSync(get('--out'), JSON.stringify(r, null, 2) + '\n');
    if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(`Auditoría determinista contra ${r.base}: sugerido ${r.suggested.toUpperCase()} (${r.findings.length} hallazgo(s) en ${r.files.length} archivo(s))`);
      for (const c of r.checks) console.log(`  ${c.result.toUpperCase().padEnd(13)} ${c.name}: ${c.detail || ''}`);
      for (const f of r.findings) console.log(`- ${f.severity} [${f.area}] ${f.where}: ${f.issue} → ${f.fix}`);
    }
    process.exit(r.findings.some((f) => f.severity === 'P0') ? 1 : 0);
  } catch (e) { console.error(e.message); process.exit(2); }
}
module.exports = { audit, scan };
