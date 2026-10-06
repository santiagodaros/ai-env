#!/usr/bin/env node
// Verifica los documentos de cierre de una feature. Exit 1 si algo no cumple.
// Uso: node verify.cjs [--slug <slug>]
const { git, repoRoot, resolveSlug, fs, path } = require('./lib.cjs');
const argv = process.argv.slice(2);
const root = repoRoot();
const i = argv.indexOf('--slug');
const slug = resolveSlug(root, i >= 0 ? argv[i + 1] : undefined);
if (!slug) { console.error('RECHAZADO: no pude determinar la feature (--slug).'); process.exit(1); }
const errs = [];
const read = p => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return null; } };

const design = read(`docs/design/${slug}.md`);
const log = read('docs/CHANGELOG.md');
const state = read(`docs/features/${slug}/STATE.md`);
if (design === null) errs.push(`falta docs/design/${slug}.md`);
if (log === null) errs.push('falta docs/CHANGELOG.md');
else if (!log.includes(`<!-- feature:${slug} -->`)) errs.push(`docs/CHANGELOG.md no tiene la entrada de la feature (marca <!-- feature:${slug} -->)`);
if (state !== null && !/^Estado:\s*cerrada/im.test(state)) errs.push(`docs/features/${slug}/STATE.md debe decir "Estado: cerrada (fecha)"`);

if (design !== null) {
  for (const h of ['Resumen', 'Flujo de punta a punta', 'Componentes y archivos', 'Configuración', 'Cómo verificar', 'Diferencias contra el SPEC', 'Sin verificar']) {
    const m = design.match(new RegExp(`^##\\s*${h}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'im'));
    if (!m) errs.push(`docs/design/${slug}.md: falta la sección "${h}"`);
    else if (!m[1].trim()) errs.push(`docs/design/${slug}.md: la sección "${h}" está vacía (escribí "Ninguna" si corresponde)`);
  }
  // Toda ruta citada entre backticks debe existir.
  const tracked = git(root, ['ls-files']).stdout.split('\n');
  const PATHLIKE = /^[\w@.\-]+(\/[\w@.\-\[\]]+)+$|^[\w\-]+\.(ts|tsx|js|cjs|mjs|json|md|yml|yaml|ps1|sh|css|html|tf|bicep)$/;
  const seen = new Set();
  for (const m of design.matchAll(/`([^`\s]+)`/g)) {
    const t = m[1].replace(/[.,;:]$/, '');
    if (seen.has(t) || /^https?:/.test(t) || /[*<>]/.test(t) || !PATHLIKE.test(t)) continue;
    seen.add(t);
    const exists = fs.existsSync(path.join(root, t)) || (!t.includes('/') && tracked.some(f => f.endsWith('/' + t) || f === t));
    if (!exists) errs.push(`docs/design/${slug}.md cita \`${t}\` y no existe en el repo`);
  }
}
// Datos privados
let terms = (process.env.PRIVATE_TERMS || '').split(',');
const tf = read('.private-terms'); if (tf) terms = terms.concat(tf.split(/\r?\n/));
terms = terms.map(t => t.trim()).filter(Boolean);
for (const [name, txt] of [[`docs/design/${slug}.md`, design], ['docs/CHANGELOG.md', log], [`docs/features/${slug}/STATE.md`, state]]) {
  if (!txt) continue;
  for (const t of terms) if (txt.toLowerCase().includes(t.toLowerCase())) errs.push(`${name} contiene un término privado ("${t}")`);
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(txt)) errs.push(`${name} contiene un GUID (datos de tenant)`);
}
if (errs.length) { console.error('FALTA:\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`OK: documentos de cierre de "${slug}" verificados.`);
