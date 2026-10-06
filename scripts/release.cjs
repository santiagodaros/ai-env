#!/usr/bin/env node
// Sube la versión de uno o más plugins y anota el cambio en CHANGELOG.md. No commitea ni crea tags:
// el tag <plugin>--v<versión> lo crea el workflow de release cuando el commit llega a main.
// Uso:
//   node scripts/release.cjs <plugin>[,<plugin>...] <patch|minor|major> "<qué cambió, para quien lo usa>"
//   node scripts/release.cjs --changed <patch|minor|major> "<qué cambió>"     todos los que cambiaron desde su tag
//   node scripts/release.cjs --tag-missing [--push]                            crea los tags que falten (lo usa el CI)
// patch: arreglo sin cambio de comportamiento · minor: algo nuevo compatible · major: rompe cómo se usa.
const fs = require('fs'), path = require('path');
const V = require('./versions-lib.cjs');
const argv = process.argv.slice(2);
const fail = (m) => { console.error('RECHAZADO: ' + m); process.exit(1); };

if (argv[0] === '--tag-missing') {
  const made = [];
  for (const p of V.plugins()) {
    const v = V.manifest(p).version, t = V.tagOf(p, v);
    if (!V.SEMVER.test(v || '') || V.tagExists(t)) continue;
    const r = V.git(['tag', '-a', t, '-m', `${p} ${v}`]);
    if (r.status !== 0) fail(`no pude crear ${t}: ${r.stderr.trim()}`);
    made.push(t);
  }
  if (made.length && argv.includes('--push')) { const r = V.git(['push', 'origin', ...made]); if (r.status !== 0) fail(`no pude subir los tags: ${r.stderr.trim()}`); }
  console.log(made.length ? `Tags creados${argv.includes('--push') ? ' y subidos' : ''}: ${made.join(', ')}` : 'No faltaba ningún tag.');
  process.exit(0);
}

const [target, level, ...rest] = argv;
const note = rest.join(' ').replace(/\s+/g, ' ').trim();
if (!target || !['patch', 'minor', 'major'].includes(level)) fail('uso: release.cjs <plugin[,plugin]|--changed> <patch|minor|major> "<qué cambió>"');
if (note.length < 10) fail('falta la nota (10 caracteres o más): qué cambia para quien usa el plugin.');
let names;
if (target === '--changed') {
  names = V.plugins().filter((p) => { const t = V.tagOf(p, V.manifest(p).version); return V.tagExists(t) && V.changedSince(p, t); });
  if (!names.length) { console.log('Ningún plugin cambió desde su última versión publicada.'); process.exit(0); }
} else {
  names = target.split(',').map((s) => s.trim()).filter(Boolean);
  for (const n of names) if (!V.plugins().includes(n)) fail(`no existe el plugin "${n}". Plugins: ${V.plugins().join(', ')}`);
}
const bumped = [];
for (const p of names) {
  const file = V.manifestPath(p), txt = fs.readFileSync(file, 'utf8'), cur = JSON.parse(txt).version;
  if (!V.SEMVER.test(cur || '')) fail(`${p} no tiene una versión x.y.z`);
  if (!V.tagExists(V.tagOf(p, cur))) { console.log(`${p}: ${cur} todavía no se publicó; no hace falta subirla de nuevo.`); bumped.push([p, cur]); continue; }
  const [a, b, c] = cur.split('.').map(Number);
  const next = level === 'major' ? `${a + 1}.0.0` : level === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
  fs.writeFileSync(file, txt.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`));
  bumped.push([p, next]); console.log(`${p}: ${cur} -> ${next}`);
}
const cl = path.join(V.root, 'CHANGELOG.md');
let s = fs.readFileSync(cl, 'utf8');
const entry = `## ${new Date().toISOString().slice(0, 10)} — ${bumped.map(([p, v]) => `${p} ${v}`).join(', ')}\n\n- ${note}\n\n`;
const i = s.search(/^## /m);
s = i >= 0 ? s.slice(0, i) + entry + s.slice(i) : s + '\n' + entry;
fs.writeFileSync(cl, s);
console.log('\nAnotado en CHANGELOG.md. Revisá, commiteá y subí a main: el tag lo crea el workflow de release.');
