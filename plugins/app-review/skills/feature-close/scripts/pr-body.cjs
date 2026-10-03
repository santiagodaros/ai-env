#!/usr/bin/env node
// Arma docs/features/<slug>/PR.md con título y descripción del PR desde los documentos ya verificados
// (CHANGELOG, diseño final y FACTS). No usa el modelo: solo ensambla. Uso: node pr-body.cjs [--slug <slug>]
const { repoRoot, resolveSlug, fs, path } = require('./lib.cjs');
const argv = process.argv.slice(2);
const root = repoRoot();
const i = argv.indexOf('--slug');
const slug = resolveSlug(root, i >= 0 ? argv[i + 1] : undefined);
const fail = m => { console.error('RECHAZADO: ' + m); process.exit(1); };
if (!slug) fail('no pude determinar la feature (--slug).');
const read = p => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return null; } };
const log = read('docs/CHANGELOG.md'), design = read(`docs/design/${slug}.md`), facts = read(`.claude/.feature-flow/${slug}-facts.md`);
if (!log || !design) fail('faltan docs/CHANGELOG.md o el diseño final: corré feature-close primero.');
const mark = `<!-- feature:${slug} -->`;
const at = log.indexOf(mark);
if (at < 0) fail(`el CHANGELOG no tiene la entrada de "${slug}".`);
const rest = log.slice(at + mark.length);
const entry = rest.slice(0, (rest.search(/<!-- feature:|^## /m) + 1 || rest.length + 1) - 1).trim();
const title = ((entry.match(/^###\s+(.+)$/m) || [])[1] || slug).replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '');
const body = entry.replace(/^###\s+.+\n?/m, '').trim();
const sec = (txt, h) => { const m = txt && txt.match(new RegExp(`^##\\s*${h}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'im')); return m ? m[1].trim() : ''; };
const f = (h) => sec(facts, h);
const pr = [
  `## Resumen`, sec(design, 'Resumen'), '',
  `## Cambios`, body, '',
  `## Cómo verificar`, sec(design, 'Cómo verificar'), '',
  `## Diferencias contra el SPEC`, sec(design, 'Diferencias contra el SPEC'), '',
  `## Sin verificar`, sec(design, 'Sin verificar'), '',
  ...(facts ? [`## Verificaciones`, f('Verificaciones') || '(sin scripts)', '', `## Pruebas`, f('Pruebas \\(compuerta\\)') || '(sin dato)', '', `## Consumo`, f('Consumo medido') || '(sin medición)', ''] : []),
  `Documentos: \`docs/design/${slug}.md\`, \`docs/CHANGELOG.md\`, \`docs/features/${slug}/\``, '',
].join('\n');
const dest = path.join(root, 'docs', 'features', slug, 'PR.md');
fs.writeFileSync(dest, `<!-- title: ${title} -->\n${pr}`);
console.log(`Título: ${title}\nCuerpo: docs/features/${slug}/PR.md`);
