#!/usr/bin/env node
// Camino corto para cambios chicos: decide con reglas fijas si lo que está en el índice de git es un arreglo
// menor y, si lo es, corre las mismas compuertas que una feature (verificaciones, pruebas, arquitectura, seguridad)
// y anota una línea en docs/CHANGELOG.md. Si no lo es, lo dice y manda al flujo completo.
// Uso: node quick.cjs [--log "<qué se arregló>"] [--no-test "<motivo que dio el usuario>"] [--json]
// Salida: 0 pasa · 3 no es un cambio chico o falló una compuerta · 1 no se puede evaluar.
const { run, git, repoRoot, fs, path } = require('../../feature-close/scripts/lib.cjs');
const { testGate, CODE, NOT_CODE, TEST } = require('../../feature-close/scripts/gates.cjs');
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const asJson = argv.includes('--json');
const fail = (m) => { console.error('RECHAZADO: ' + m); process.exit(1); };
const root = repoRoot();

// Umbrales: se pueden bajar o subir en .claude/dev-flow.json, nunca por encima del techo.
const CEIL = { maxFiles: 5, maxLines: 120 }, DEF = { maxFiles: 3, maxLines: 60 };
let cfg = {};
try { cfg = (JSON.parse(fs.readFileSync(path.join(root, '.claude', 'dev-flow.json'), 'utf8')).quickFix) || {}; } catch { /* sin config */ }
const lim = (k) => Math.max(1, Math.min(CEIL[k], Number.isInteger(cfg[k]) ? cfg[k] : DEF[k]));
const maxFiles = lim('maxFiles'), maxLines = lim('maxLines');

const staged = git(root, ['diff', '--cached', '--name-status']).stdout.trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
if (!staged.length) fail('no hay nada en el índice. Agregá con git add solo los archivos del arreglo y volvé a correr.');
const loose = git(root, ['status', '--porcelain', '--untracked-files=all']).stdout.split('\n').filter((l) => l.trim())
  .filter((l) => l[1] !== ' ' || l.startsWith('??')).map((l) => l.slice(3).split(' -> ').pop().trim().replace(/^"|"$/g, ''))
  .filter((f) => !/^(docs\/|\.claude\/\.feature-flow\/)/.test(f));
if (loose.length) fail(`hay cambios fuera del índice (${loose.slice(0, 5).join(', ')}${loose.length > 5 ? '…' : ''}). Agregalos si son parte del arreglo o descartalos: se evalúa exactamente lo que se va a commitear.`);

const last = (p) => p[p.length - 1];
const files = staged.filter((p) => !/^docs\/CHANGELOG\.md$/.test(last(p)));
const lines = {};
for (const l of git(root, ['diff', '--cached', '--numstat']).stdout.trim().split('\n').filter(Boolean)) { const [a, d, f] = l.split('\t'); lines[f.replace(/^.* => /, '').replace(/[{}]/g, '')] = (Number(a) || 0) + (Number(d) || 0); }
const isCode = (f) => CODE.test(f) && !NOT_CODE.test(f) && !TEST.test(f);
const code = files.map(last).filter(isCode);
const codeLines = code.reduce((n, f) => n + (lines[f] || 0), 0);
const add = git(root, ['diff', '--cached', '--shortstat']).stdout.trim();

// --- ¿Es un cambio chico?
const why = [];
if (code.length > maxFiles) why.push(`toca ${code.length} archivos de código (máximo ${maxFiles})`);
if (codeLines > maxLines) why.push(`cambia ${codeLines} líneas de código (máximo ${maxLines})`);
const all = files.map(last);
const hit = (re) => all.filter((f) => re.test(f));
const RULES = [
  [/(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[\w.-]*\.txt|pyproject\.toml|poetry\.lock|Pipfile(\.lock)?|go\.(mod|sum)|Cargo\.(toml|lock)|pom\.xml|build\.gradle(\.kts)?|[\w.-]+\.csproj|packages\.config|Directory\.Packages\.props)$/i, 'cambia dependencias o el manifiesto del proyecto'],
  [/\.(tf|tfvars|bicep|bicepparam)$|(^|\/)(azure-pipelines[\w.-]*\.ya?ml|\.github\/workflows\/)|(^|\/)(infra|infrastructure|iac|deploy|terraform|bicep)\//i, 'toca infraestructura o pipelines'],
  [/(^|\/)(architecture\.json|ARCHITECTURE\.md)$|(^|\/)docs\/decisions\//, 'cambia la arquitectura o una decisión registrada'],
  [/(auth|login|oauth|msal|token|secret|credential|password|permission|rbac|role|polic|identity|iam|crypto|session|cors|csrf)/i, 'toca identidad, permisos, secretos o sesión'],
  [/(^|\/)migrations?\/|\.sql$/i, 'toca el esquema o datos persistentes'],
  [/(^|\/)\.claude\/(?!\.feature-flow\/)/, 'cambia la configuración de Claude Code del repo'],
];
for (const [re, msg] of RULES) { const h = hit(re); if (h.length) why.push(`${msg} (${h.slice(0, 3).join(', ')}${h.length > 3 ? '…' : ''})`); }

const out = { ok: false, small: why.length === 0, why, files: files.length, code: code.length, codeLines, limits: { maxFiles, maxLines }, gates: [] };
const finish = (code_) => {
  if (asJson) console.log(JSON.stringify(out, null, 2));
  else {
    const L = [`Cambio: ${files.length} archivo(s), ${code.length} de código, ${codeLines} líneas de código (${add || 'sin estadística'}).`];
    if (!out.small) L.push('', 'NO es un cambio chico:', ...why.map((w) => '- ' + w), '', 'Seguí el flujo completo: /dev-flow:feature-flow (o /dev-flow:feature-run). Lo ya escrito sirve: creá la feature y commiteá en su rama.');
    else { L.push('', 'Compuertas:', ...out.gates.map((g) => `- ${g.ok ? 'OK' : g.warn ? 'AVISO' : 'FALLA'} ${g.name}: ${g.note}`)); if (out.logged) L.push('', `Anotado en docs/CHANGELOG.md: ${out.logged}`); L.push('', out.ok ? (out.logged ? 'Listo para commitear.' : 'Pasa. Volvé a correr con --log "<qué se arregló>" para anotarlo y commitear.') : 'No commitees: corregí lo que falla y volvé a correr.'); }
    console.log(L.join('\n'));
  }
  process.exit(code_);
};
if (!out.small) finish(3);

// --- Compuertas (las mismas que al cerrar una feature)
const gate = (name, ok, note, warn = false) => out.gates.push({ name, ok, note, warn });
let pkg = {}; try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { /* sin package.json */ }
const scripts = ['typecheck', 'lint', 'test'].filter((n) => pkg.scripts && pkg.scripts[n]);
for (const n of scripts) { const r = run('npm', ['run', n, '--silent'], { cwd: root, timeout: 300000 }); gate(`npm run ${n}`, r.status === 0, r.status === 0 ? 'pasa' : `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-12).join('\n  ')); }
if (!scripts.length) gate('verificaciones', true, 'el repo no tiene scripts typecheck, lint ni test: nada que correr', true);

const noTest = val('--no-test');
const tg = testGate(files, noTest ? `Sin pruebas: ${noTest}` : '');
gate('pruebas', tg.ok, tg.ok ? tg.note : 'cambia código y ninguna prueba. Agregá una prueba que falle sin el arreglo, o si el usuario decide que no corresponde, pasá --no-test "<su motivo, 10 caracteres o más>"');

try {
  const ac = path.join(__dirname, '..', '..', '..', 'lib', 'arch', 'arch-check.cjs');
  const r = run(process.execPath, [ac, '--json'], { cwd: root, shell: false }); const j = JSON.parse(r.stdout || '{}');
  if (j.configs) gate('arquitectura', !j.violations.length, j.violations.length ? j.violations.slice(0, 5).map((v) => `${v.file}${v.line ? ':' + v.line : ''}: ${v.msg}`).join('; ') : 'la regla de dependencia se cumple');
} catch { /* sin architecture.json */ }
try {
  const sc = path.join(__dirname, '..', '..', 'security-diff', 'scripts', 'secscan.cjs');
  const r = run(process.execPath, [sc, '--range', '--cached', '--json'], { cwd: root, shell: false }); const j = JSON.parse(r.stdout || '{}');
  if (j.high) { gate('seguridad', !j.high.length, j.high.length ? j.high.map((f) => `${f.id} ${f.file}:${f.line} ${f.msg}`).join('; ') : `sin hallazgos altos${j.medium.length ? `; ${j.medium.length} medio(s) a mirar: ` + j.medium.slice(0, 3).map((f) => `${f.id} ${f.file}:${f.line}`).join(', ') : ''}`); }
} catch { /* sin escáner */ }

out.ok = out.gates.every((g) => g.ok);
const text = val('--log');
if (out.ok && text !== undefined) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length < 10 || t.length > 200) fail('--log necesita entre 10 y 200 caracteres: qué se arregló, en una línea.');
  const f = path.join(root, 'docs', 'CHANGELOG.md');
  let s = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '# Historial de cambios\n\n## Sin publicar\n';
  if (!/^## Sin publicar\s*$/m.test(s)) s = s.replace(/^(# .*\n)/, '$1\n## Sin publicar\n') || s;
  if (!/^## Sin publicar\s*$/m.test(s)) s = `## Sin publicar\n\n${s}`;
  // Si ya se anotó en una corrida anterior de este mismo arreglo (línea agregada y todavía sin commitear), se reemplaza.
  const prev = git(root, ['diff', '--cached', '--unified=0', '--', 'docs/CHANGELOG.md']).stdout.split('\n').filter((l) => /^\+- \d{4}-\d{2}-\d{2} · arreglo: /.test(l)).map((l) => l.slice(1));
  if (prev.length) s = s.split('\n').filter((l) => !prev.includes(l)).join('\n');
  const line = `- ${new Date().toISOString().slice(0, 10)} · arreglo: ${t}${noTest ? ` (sin prueba: ${noTest})` : ''}`;
  s = s.replace(/^## Sin publicar\s*$/m, (m) => `${m}\n\n${line}`).replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s);
  git(root, ['add', 'docs/CHANGELOG.md']);
  out.logged = line;
}
finish(out.ok ? 0 : 3);
