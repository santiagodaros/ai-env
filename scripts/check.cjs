#!/usr/bin/env node
// Chequeos antes de publicar: datos privados, frontmatter de skills, sintaxis de scripts.
// Términos privados: archivo local .private-terms (uno por línea, NO versionado) o env PRIVATE_TERMS="a,b".
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const errors = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  ['.git', 'node_modules', '.private-terms'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(root);
const rel = f => path.relative(root, f).replace(/\\/g, '/');

let terms = (process.env.PRIVATE_TERMS || '').split(',');
const tf = path.join(root, '.private-terms');
if (fs.existsSync(tf)) terms = terms.concat(fs.readFileSync(tf, 'utf8').split(/\r?\n/));
terms = terms.map(t => t.trim()).filter(Boolean);
if (!terms.length) console.warn('AVISO: sin .private-terms ni PRIVATE_TERMS; solo corren los patrones genéricos.');

const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const EMAIL = /[\w.+-]+@(?!example\.|users\.noreply\.github\.com)[\w-]+\.[a-z]{2,}/i;
// Casos de prueba del hook protect-files: contienen un secreto falso a propósito.
const SECRET_ALLOW = ['tests/smoke-test.js'];
const SECRET = /(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|client_secret\s*[:=]\s*['"][^'"]{8,})/;
for (const f of files) {
  if (/\.(zip|png|jpg|ico|woff2?)$/i.test(f)) continue;
  const txt = fs.readFileSync(f, 'utf8');
  for (const t of terms) if (txt.toLowerCase().includes(t.toLowerCase())) errors.push(`${rel(f)}: contiene término privado "${t}"`);
  if (GUID.test(txt)) errors.push(`${rel(f)}: contiene un GUID`);
  if (EMAIL.test(txt)) errors.push(`${rel(f)}: contiene un email`);
  if (SECRET.test(txt) && !SECRET_ALLOW.includes(rel(f))) errors.push(`${rel(f)}: parece contener un secreto`);
}
for (const f of files.filter(f => f.endsWith('SKILL.md'))) {
  const m = fs.readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) { errors.push(`${rel(f)}: sin frontmatter`); continue; }
  const name = (m[1].match(/^name:\s*(.+)$/m) || [])[1];
  if (!name) errors.push(`${rel(f)}: falta name`);
  else if (name.trim() !== path.basename(path.dirname(f))) errors.push(`${rel(f)}: name "${name.trim()}" != carpeta`);
  if (!/^description:/m.test(m[1])) errors.push(`${rel(f)}: falta description`);
}
for (const f of files.filter(f => /\.(cjs|js)$/.test(f))) {
  const r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) errors.push(`${rel(f)}: error de sintaxis`);
}
for (const f of files.filter(f => f.endsWith('.json') && !f.includes('node_modules'))) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch { errors.push(`${rel(f)}: JSON inválido`); }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OK: ${files.length} archivos revisados`);
