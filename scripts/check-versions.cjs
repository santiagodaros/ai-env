#!/usr/bin/env node
// Verifica el versionado de los plugins. Falla si:
//  - un plugin no tiene una versión semver (x.y.z);
//  - el contenido de un plugin cambió respecto del tag de su versión actual (hay que subir la versión);
//  - la versión del manifiesto es menor o igual a una ya publicada que no es la actual.
// Quien instala el plugin solo recibe cambios cuando sube la versión: por eso un cambio sin subirla es un error.
// Uso: node scripts/check-versions.cjs [--json]
const V = require('./versions-lib.cjs');
const rows = [], errors = [];
for (const p of V.plugins()) {
  const v = V.manifest(p).version;
  if (!v || !V.SEMVER.test(v)) { errors.push(`${p}: falta "version" con formato x.y.z en plugin.json`); continue; }
  const tag = V.tagOf(p, v), pub = V.published(p), last = pub[pub.length - 1];
  let state;
  if (V.tagExists(tag)) {
    if (V.changedSince(p, tag)) { state = 'cambió sin subir la versión'; errors.push(`${p}: el contenido cambió desde ${tag}. Subí la versión: node scripts/release.cjs ${p} <patch|minor|major> "<qué cambió>"`); }
    else state = 'publicado';
  } else {
    if (last && V.cmp(v, last) <= 0) { state = 'versión menor a la publicada'; errors.push(`${p}: la versión ${v} no supera a la última publicada (${last}).`); }
    else state = last ? `pendiente de publicar (última: ${last})` : 'pendiente de publicar (primera versión)';
  }
  rows.push({ plugin: p, version: v, state });
}
if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: !errors.length, plugins: rows, errors }, null, 2));
else {
  const w = Math.max(...rows.map((r) => r.plugin.length));
  for (const r of rows) console.log(`${r.plugin.padEnd(w)}  ${r.version.padEnd(8)} ${r.state}`);
  for (const e of errors) console.error('ERROR ' + e);
}
process.exit(errors.length ? 1 : 0);
