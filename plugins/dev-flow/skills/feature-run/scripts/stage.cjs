#!/usr/bin/env node
// Dice en qué etapa está una feature y cuál es el paso siguiente, mirando solo el estado en archivos y git.
// Es lo que hace reanudable a feature-run: cada corrida arranca preguntándole a este script.
// Uso: node stage.cjs --slug <slug> [--base <ref>]
const fs = require('fs'), path = require('path');
const lib = require('../../feature-close/scripts/lib.cjs');
const { testGate } = require('../../feature-close/scripts/gates.cjs');
const argv = process.argv.slice(2);
const val = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const root = lib.repoRoot();
const slug = val('--slug');
const done = (stage, why, next) => { console.log(JSON.stringify({ slug, stage, why, next })); process.exit(0); };
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+){0,4}$/.test(slug)) { console.error('RECHAZADO: --slug inválido.'); process.exit(1); }
const rel = f => `docs/features/${slug}/${f}`;
const read = f => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return null; } };
const tracked = f => lib.git(root, ['ls-files', '--error-unmatch', f]).status === 0;

const spec = read(rel('SPEC.md'));
if (!spec || spec.trim().length < 200 || !read(rel('STATE.md')) || !read(rel('HANDOFF.md'))) done('spec', 'faltan o están incompletos SPEC, STATE o HANDOFF', '/dev-flow:feature-flow: crear docs/features/<slug>/ y aprobar el SPEC con el usuario');
if (!['SPEC.md', 'STATE.md', 'HANDOFF.md'].every(f => tracked(rel(f)))) done('commit-docs', 'los documentos de la feature no están commiteados', 'commitear solo docs/features/<slug>');

const base = lib.baseRef(root, val('--base'));
if (!base) done('error', 'no encontré la rama base', 'pasar --base');
const mb = lib.git(root, ['merge-base', 'HEAD', base]).stdout.trim();
const files = lib.git(root, ['diff', '--name-status', `${mb}..HEAD`]).stdout.trim().split('\n').filter(Boolean).map(l => l.split('\t'))
  .filter(p => !new RegExp(`^docs/(features/${slug}/|design/${slug}\\.md|CHANGELOG\\.md)`).test(p[p.length - 1]));
if (!files.length) done('implement', 'no hay commits de código respecto de la base', 'implementar la feature siguiendo el SPEC, con commits en la rama');
if (lib.git(root, ['status', '--porcelain', '--untracked-files=all']).stdout.split('\n').some(l => l.trim() && !/docs\/|\.claude\/\.feature-flow\//.test(l))) done('implement', 'hay cambios de código sin commitear', 'terminar y commitear');

const state = read(rel('STATE.md'));
const tg = testGate(files, state);
if (!tg.ok) done('tests', tg.note, 'agregar pruebas para el código cambiado (o que el usuario declare "Sin pruebas: <motivo>")');

const closed = /^Estado:\s*cerrada/im.test(state || '') && read(`docs/design/${slug}.md`) && (read('docs/CHANGELOG.md') || '').includes(`<!-- feature:${slug} -->`);
if (!closed) done('close', 'faltan el cierre, el CHANGELOG o el diseño final', '/dev-flow:feature-close');
if (!read(rel('PR.md'))) done('pr', 'falta la descripción del PR', 'node ../feature-close/scripts/pr-body.cjs --slug <slug> y commitear');
done('done', 'feature cerrada con descripción de PR lista', 'abrir el PR solo con el sí explícito del usuario (/dev-flow:pr-prep)');
