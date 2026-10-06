#!/usr/bin/env node
// Lanzador de sesiones por feature con límites duros. Por defecto es un dry-run: no lanza nada.
// Uso: node launch.cjs --slug <slug> [--launch]
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');

// Techos fijos: el archivo de configuración puede bajar los topes, no subirlos por encima de esto.
const CEIL = { maxConcurrent: 3, maxPerDay: 6, minCooldownMinutes: 5 };
const DEFAULTS = { maxConcurrent: 2, maxPerDay: 3, cooldownMinutes: 10 };

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

let cfg = { ...DEFAULTS };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(path.join(root, '.claude', 'feature-flow.json'), 'utf8')) }; } catch { /* sin config: defaults */ }
const maxConcurrent = Math.min(Math.max(Number(cfg.maxConcurrent) || 0, 0), CEIL.maxConcurrent);
const maxPerDay = Math.min(Math.max(Number(cfg.maxPerDay) || 0, 0), CEIL.maxPerDay);
const cooldown = Math.max(Number(cfg.cooldownMinutes) || 0, CEIL.minCooldownMinutes);

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

// Sesiones en segundo plano vivas. Falla cerrado: si no se puede contar, no se lanza.
const ag = run('claude', ['agents', '--json']);
let bg;
try {
  const list = JSON.parse(ag.stdout);
  if (!Array.isArray(list)) throw new Error('no es lista');
  bg = list.filter(s => s && s.kind && s.kind !== 'interactive').length;
} catch { fail('no pude contar las sesiones activas (claude agents --json). Por seguridad no lanzo.'); }
if (bg >= maxConcurrent) fail(`ya hay ${bg} sesión(es) en segundo plano (tope ${maxConcurrent}). Terminá o cerrá una con claude agents.`);

// Registro de lanzamientos (local, fuera de git).
const regDir = path.join(root, '.claude', '.feature-flow');
const regFile = path.join(regDir, 'launches.json');
let reg = [];
try { reg = JSON.parse(fs.readFileSync(regFile, 'utf8')); } catch { /* primer uso */ }
const now = Date.now(), DAY = 24 * 3600 * 1000;
const today = new Date().toDateString();
const todayN = reg.filter(r => new Date(r.at).toDateString() === today).length;
if (todayN >= maxPerDay) fail(`ya lanzaste ${todayN} sesión(es) hoy (tope ${maxPerDay}).`);
const last = reg.length ? Math.max(...reg.map(r => r.at)) : 0;
if (now - last < cooldown * 60000) fail(`esperá ${Math.ceil((cooldown * 60000 - (now - last)) / 60000)} min desde el último lanzamiento (espera mínima ${cooldown} min).`);
if (reg.some(r => r.slug === slug && now - r.at < DAY)) fail(`"${slug}" ya se lanzó en las últimas 24 h. Retomala con claude attach o claude -w ${slug}.`);

// Presupuesto del límite de 5 h (si hay datos): rechaza con poco margen o si la feature no entra.
let presupuesto = 'Presupuesto: sin datos del límite de 5 h.';
{
  const bp = path.join(__dirname, '..', '..', 'budget-plan', 'scripts', 'budget.cjs');
  if (fs.existsSync(bp)) {
    const b = run(process.execPath, [bp, 'check', slug, '--json'], { cwd: root, shell: false });
    try { presupuesto = 'Presupuesto: ' + JSON.parse(b.stdout).text.replace(/\n/g, ' '); } catch { /* sin datos */ }
    if (b.status === 4) fail(presupuesto);
  }
}

const prompt = `Retoma la feature ${slug}: lee docs/features/${slug}/HANDOFF.md y SPEC.md y segui desde el proximo paso. No abras sesiones nuevas.`;
const args = ['--bg', '-w', slug, '-n', slug, prompt];
console.log(`Feature: ${slug}`);
console.log(`Cupos: ${bg}/${maxConcurrent} en segundo plano, ${todayN}/${maxPerDay} lanzadas hoy, espera mínima ${cooldown} min.`);
console.log(presupuesto);
console.log(`Comando: claude --bg -w ${slug} -n ${slug} "${prompt}"`);
console.log(`Alternativa manual (sin gastar cupo): claude -w ${slug} -n ${slug}`);
if (!flag('--launch')) { console.log('Dry-run: no se lanzó nada. Agregá --launch para lanzar.'); process.exit(0); }

const r = run('claude', process.platform === 'win32' ? args.map((a, i) => (i === args.length - 1 ? `"${a}"` : a)) : args, { cwd: root, env: { ...process.env, FEATURE_FLOW_CHILD: '1' } });
if (r.status !== 0) fail(`claude devolvió error: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`);
fs.mkdirSync(regDir, { recursive: true });
reg.push({ slug, at: now });
fs.writeFileSync(regFile, JSON.stringify(reg.slice(-50), null, 2));
console.log('Lanzada. ' + (r.stdout || '').trim());
console.log('Seguila con: claude agents  /  claude attach <id>');
