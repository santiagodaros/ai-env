#!/usr/bin/env node
// Lanzador de sesiones por feature con límites duros. Por defecto es un dry-run: no lanza nada.
// Uso: node launch.cjs --slug <slug> [--launch]
// Los topes y el registro son los mismos que usa dispatch.cjs (lib/launch-guard.cjs): un solo cupo para ambos.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const guard = require('../../../lib/launch-guard.cjs');

const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const val = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const fail = msg => { console.error('RECHAZADO: ' + msg); process.exit(1); };
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' && cmd !== 'git' && cmd !== process.execPath, ...opts });

const slug = val('--slug');
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+){0,4}$/.test(slug) || slug.length > 40) fail('--slug inválido (minúsculas, números y guiones; hasta 5 palabras, 40 caracteres).');
if (process.env.FEATURE_FLOW_CHILD) fail('esta sesión fue lanzada por feature-flow y no puede lanzar otras.');

const top = run('git', ['rev-parse', '--show-toplevel']);
if (top.status !== 0) fail('no estás dentro de un repo git.');
const root = top.stdout.trim();

// Documentos requeridos y commiteados (un worktree se crea desde el último commit).
const dir = path.join(root, 'docs', 'features', slug);
const rel = f => `docs/features/${slug}/${f}`;
for (const f of ['SPEC.md', 'STATE.md', 'HANDOFF.md']) {
  if (!fs.existsSync(path.join(dir, f))) fail(`falta ${rel(f)}.`);
}
if (fs.readFileSync(path.join(dir, 'SPEC.md'), 'utf8').trim().length < 200) fail(`${rel('SPEC.md')} tiene menos de 200 caracteres: completá el SPEC primero.`);
for (const f of ['SPEC.md', 'STATE.md', 'HANDOFF.md']) {
  if (run('git', ['ls-files', '--error-unmatch', rel(f)], { cwd: root }).status !== 0) fail(`${rel(f)} no está commiteado. Commiteá docs/features/${slug} primero.`);
}
if (run('git', ['status', '--porcelain', '--', `docs/features/${slug}`], { cwd: root }).stdout.trim()) fail(`hay cambios sin commitear en docs/features/${slug}.`);

const c = guard.check(root, slug, ['claude']);
if (!c.ok) fail(c.msg);
const b = guard.budget(root, slug);
if (!b.ok) fail(b.text);

const prompt = `Retoma la feature ${slug}: lee docs/features/${slug}/HANDOFF.md y SPEC.md y segui desde el proximo paso. No abras sesiones nuevas.`;
const args = ['--bg', '-w', slug, '-n', slug, prompt];
console.log(`Feature: ${slug}`);
console.log(`Cupos: ${c.info.running.total}/${c.info.maxConcurrent} en segundo plano, ${c.info.today}/${c.info.maxPerDay} lanzadas en 24 h, espera mínima ${c.info.cooldown} min.`);
console.log(b.text);
console.log(`Comando: claude --bg -w ${slug} -n ${slug} "${prompt}"`);
console.log(`Alternativa manual (sin gastar cupo): claude -w ${slug} -n ${slug}`);
if (!flag('--launch')) { console.log('Dry-run: no se lanzó nada. Agregá --launch para lanzar.'); process.exit(0); }

const r = run('claude', process.platform === 'win32' ? args.map((a, i) => (i === args.length - 1 ? `"${a}"` : a)) : args, { cwd: root, env: { ...process.env, FEATURE_FLOW_CHILD: '1' } });
if (r.status !== 0) fail(`claude devolvió error: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`);
guard.record(root, { slug, key: slug, kind: 'feature', mode: 'bg' });
console.log('Lanzada. ' + (r.stdout || '').trim());
console.log('Seguila con: claude agents  /  claude attach <id>');
