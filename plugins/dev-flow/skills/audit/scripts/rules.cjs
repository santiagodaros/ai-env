// Reglas deterministas del proyecto (dev-flow 2.8): lo que el auditor encontró a ojo tres veces pasa a ser un chequeo
// que corre solo. Viven en .dev-flow/rules.json, las aplica audit.cjs a las líneas agregadas del diff y cada una trae su
// prueba: `examples.bad` (líneas que tiene que encontrar) y `examples.good` (líneas que no). Una regla que no pasa su
// prueba no se aplica ni se puede aprobar.
//   { "id": "regla-sin-idempotencia", "area": "resiliencia", "severity": "P1",
//     "pattern": "retry\\(.*\\bpost\\(", "flags": "i", "paths": "^src/", "exempt": "Idempotency-Key",
//     "issue": "POST reintentado sin clave de idempotencia", "fix": "mandar Idempotency-Key y deduplicar en el servidor",
//     "examples": { "bad": ["await retry(() => api.post('/pagos', body))"], "good": ["await retry(() => api.post('/pagos', body, { headers: { 'Idempotency-Key': k } }))"] } }
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join('.dev-flow', 'rules.json');
const SEV = ['P0', 'P1', 'P2'];
const ID = /^regla-[a-z0-9-]{3,40}$/;
// Sin `paths`, la regla mira código: no el estado de dev-flow, ni docs, ni datos.
const SKIP = /(^|\/)(\.dev-flow|\.claude|docs)\/|\.(md|json|ya?ml|lock|txt|csv)$/i;

const re = (src, flags) => { try { return new RegExp(src, String(flags || '').replace(/[^imsu]/g, '')); } catch { return null; } };

// Devuelve los problemas de una regla ([] si está bien). Incluye correr su prueba.
function validate(r) {
  const p = [];
  if (!r || typeof r !== 'object') return ['no es un objeto'];
  if (!ID.test(String(r.id || ''))) p.push('id: regla-<palabras-con-guiones>');
  if (!SEV.includes(r.severity)) p.push('severity: P0, P1 o P2');
  if (!r.area || !r.issue || !r.fix) p.push('faltan area, issue o fix');
  const pat = r.pattern ? re(r.pattern, r.flags) : null;
  if (!r.pattern) p.push('falta pattern (la regex que detecta el problema)');
  else if (!pat) p.push('pattern no es una regex válida');
  if (r.paths && !re(r.paths)) p.push('paths no es una regex válida');
  const ex = r.exempt ? re(r.exempt, r.flags) : null;
  if (r.exempt && !ex) p.push('exempt no es una regex válida');
  const bad = (r.examples && r.examples.bad) || [], good = (r.examples && r.examples.good) || [];
  if (bad.length < 1 || good.length < 1) p.push('examples: al menos una línea bad (la encuentra) y una good (no la encuentra)');
  if (pat) {
    const hit = (l) => pat.test(l) && !(ex && ex.test(l));
    for (const l of bad) if (!hit(l)) p.push(`no encuentra el ejemplo malo: ${l.slice(0, 80)}`);
    for (const l of good) if (hit(l)) p.push(`marca el ejemplo bueno: ${l.slice(0, 80)}`);
  }
  return p;
}

function load(root) {
  const f = path.join(root, FILE);
  if (!fs.existsSync(f)) return { rules: [], invalid: [], file: null };
  let list;
  try { list = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return { rules: [], invalid: [{ id: '(archivo)', problems: [`JSON inválido: ${e.message}`] }], file: FILE }; }
  if (!Array.isArray(list)) return { rules: [], invalid: [{ id: '(archivo)', problems: ['tiene que ser una lista de reglas'] }], file: FILE };
  const rules = [], invalid = [];
  for (const r of list) { const pr = validate(r); if (pr.length) invalid.push({ id: (r && r.id) || '?', problems: pr }); else rules.push(r); }
  return { rules, invalid, file: FILE };
}

// files: { archivo: [{ n, t }] } con las líneas agregadas. isTest: las pruebas no se revisan con reglas de código.
function apply(rules, files, isTest = () => false) {
  const out = [];
  for (const r of rules) {
    const pat = re(r.pattern, r.flags), ex = r.exempt ? re(r.exempt, r.flags) : null, scope = r.paths ? re(r.paths) : null;
    for (const [file, lines] of Object.entries(files)) {
      if (isTest(file) || (scope ? !scope.test(file) : SKIP.test(file))) continue;
      lines.forEach((ln) => {
        // La exención se mira en la misma línea, igual que en la prueba de la regla: lo que se aprobó es lo que corre.
        if (!pat.test(ln.t) || (ex && ex.test(ln.t))) return;
        out.push({ id: r.id, area: r.area, severity: r.severity, where: `${file}:${ln.n}`, issue: r.issue, fix: r.fix, rule: 'proyecto' });
      });
    }
  }
  return out;
}

module.exports = { FILE, validate, load, apply, ID };
