#!/usr/bin/env node
// Junta los hechos verificables de una feature: commits, archivos cambiados, SPEC, decisiones y resultado de typecheck/lint/test.
// Uso: node collect.cjs [--slug <slug>] [--base <ref>] [--run]
const { run, git, repoRoot, resolveSlug, baseRef, fs, path } = require('./lib.cjs');
const { testGate } = require('./gates.cjs');
const argv = process.argv.slice(2);
const val = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const fail = m => { console.error('RECHAZADO: ' + m); process.exit(1); };

const root = repoRoot();
const slug = resolveSlug(root, val('--slug'));
if (!slug) fail('no pude determinar la feature. Pasá --slug <slug> (debe existir docs/features/<slug>/) o ubicate en su rama o worktree.');
const base = baseRef(root, val('--base'));
if (!base) fail('no encontré la rama base (origin/HEAD, main o master). Pasá --base <ref>.');
const mb = git(root, ['merge-base', 'HEAD', base]).stdout.trim();
if (!mb) fail(`no hay ancestro común entre HEAD y ${base}.`);
const head = git(root, ['rev-parse', 'HEAD']).stdout.trim();
if (mb === head) fail(`no hay commits nuevos respecto de ${base}: nada que documentar.`);
if (git(root, ['status', '--porcelain', '--untracked-files=all']).stdout.split('\n').some(l => l.trim() && !/docs\/(features\/|design\/|CHANGELOG)|\.claude\/\.feature-flow\//.test(l))) {
  fail('hay cambios sin commitear fuera de docs/. Commiteá o descartá antes de cerrar la feature.');
}

const skip = new RegExp(`^docs/(features/${slug}/|design/${slug}\\.md|CHANGELOG\\.md)`);
const commits = git(root, ['log', '--format=%h\t%s', `${mb}..HEAD`]).stdout.trim().split('\n').filter(Boolean);
const files = git(root, ['diff', '--name-status', `${mb}..HEAD`]).stdout.trim().split('\n').filter(Boolean)
  .map(l => l.split('\t')).filter(p => !skip.test(p[p.length - 1]));
if (!files.length) fail('los commits nuevos solo tocan los docs de la feature: no hay cambios de código que documentar.');
let add = 0, del = 0;
for (const l of git(root, ['diff', '--numstat', `${mb}..HEAD`]).stdout.trim().split('\n').filter(Boolean)) {
  const [a, d, f] = l.split('\t'); if (skip.test(f)) continue; add += Number(a) || 0; del += Number(d) || 0;
}
const read = f => { try { return fs.readFileSync(path.join(root, 'docs', 'features', slug, f), 'utf8'); } catch { return ''; } };
const section = (txt, re) => { const m = txt.match(new RegExp(`^##+\\s*(${re.source})[^\\n]*\\n([\\s\\S]*?)(?=^##+\\s|(?![\\s\\S]))`, 'im')); return m ? m[2].trim() : ''; };
const spec = read('SPEC.md'), state = read('STATE.md');
const specHeads = (spec.match(/^##+\s.+$/gm) || []).map(s => '- ' + s.replace(/^#+\s*/, ''));

let pkg = {}; try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { /* sin package.json */ }
const names = ['typecheck', 'lint', 'test'].filter(n => pkg.scripts && pkg.scripts[n]);
const results = [];
for (const n of names) {
  if (argv.includes('--run')) {
    const r = run('npm', ['run', n, '--silent'], { cwd: root, timeout: 300000 });
    results.push(`- \`npm run ${n}\`: ${r.status === 0 ? 'OK' : 'FALLA (exit ' + r.status + ')'}`);
    if (r.status !== 0) results.push('  ```\n  ' + `${r.stdout || ''}${r.stderr || ''}`.trim().slice(-400).replace(/\n/g, '\n  ') + '\n  ```');
  } else results.push(`- \`npm run ${n}\`: existe, no se corrió (agregá --run)`);
}

const tg = testGate(files, state);
// Arquitectura hexagonal (si el repo tiene architecture.json)
let arq = null;
try {
  const ac = path.join(__dirname, '..', '..', 'arch-first', 'scripts', 'arch-check.cjs');
  if (fs.existsSync(ac)) { const r = run(process.execPath, [ac, '--json'], { cwd: root, shell: false }); const j = JSON.parse(r.stdout || '{}'); if (j.configs) arq = j.violations; }
} catch { /* sin chequeo */ }
// Seguridad sobre el diff
let sec = null;
try {
  const sc = path.join(__dirname, '..', '..', 'security-diff', 'scripts', 'secscan.cjs');
  if (fs.existsSync(sc)) { const r = run(process.execPath, [sc, '--range', `${mb}..HEAD`, '--state', `docs/features/${slug}/STATE.md`, '--json'], { cwd: root, shell: false }); sec = JSON.parse(r.stdout || '{}'); }
} catch { /* sin escáner */ }
// ADR incompletos
let adrBad = [];
try {
  const ad = path.join(__dirname, '..', '..', 'adr', 'scripts', 'adr.cjs');
  if (fs.existsSync(ad) && fs.existsSync(path.join(root, 'docs', 'decisions'))) { const r = run(process.execPath, [ad, 'check', '--root', root], { cwd: root, shell: false }); if (r.status !== 0) adrBad = (r.stderr || '').split('\n').filter(l => l.startsWith('- ')); }
} catch { /* sin chequeo */ }
const adrPend = ((read('STATE.md').match(/^-\s*\[ADR\].*$/gim)) || []);
const blocked = (arq && arq.length) || (sec && sec.high && sec.high.length) || adrBad.length;
let consumo = '(sin medición)';
try {
  const bp = path.join(__dirname, '..', '..', 'budget-plan', 'scripts', 'budget.cjs');
  if (fs.existsSync(bp)) {
    const b = run(process.execPath, [bp, 'end', slug, '--json'], { cwd: root, shell: false });
    consumo = (JSON.parse(b.stdout || '{}').text) || consumo;
  }
} catch { /* sin medición */ }

const out = [
  `# FACTS — ${slug}`,
  `Generado por collect.cjs. Es la única fuente permitida para describir cambios: lo que no esté acá o en el código, va como "sin verificar".`,
  '',
  `- Rama base: ${base} (merge-base ${mb.slice(0, 7)})`,
  `- Commits: ${commits.length}`,
  `- Archivos cambiados: ${files.length} (+${add} −${del}), sin contar docs de la feature`,
  '',
  '## Commits', ...commits.map(c => '- ' + c.replace('\t', ' ')),
  '',
  '## Archivos (estado, ruta)', ...files.map(p => `- ${p[0]} \`${p[p.length - 1]}\`${p[0].startsWith('R') ? ` (desde \`${p[1]}\`)` : ''}`),
  '',
  '## Secciones del SPEC', ...(specHeads.length ? specHeads : ['- (sin secciones)']),
  '',
  '## Fuera de alcance (del SPEC)', section(spec, /fuera de alcance/) || '(no declarado)',
  '',
  '## Decisiones registradas (del STATE)', section(state, /decisiones/) || '(ninguna registrada)',
  '',
  '## Pruebas (compuerta)', `- ${tg.ok ? 'OK' : 'FALLA'}: ${tg.note}`, ...(tg.waiver ? [`- Sin pruebas (exención declarada): ${tg.waiver}`] : []), '',
  '## Arquitectura', arq === null ? '- (sin architecture.json)' : arq.length ? '- FALLA:\n' + arq.map(v => `  - ${v.file}${v.line ? ':' + v.line : ''}: ${v.msg}`).join('\n') : '- OK: la regla de dependencia se cumple',
  '',
  '## Seguridad (diff)', ...(sec === null ? ['- (sin escáner)'] : [`- Alta sin aceptar: ${sec.high.length}${sec.high.length ? ' FALLA' : ''}`, ...sec.high.map(f => `  - ${f.id} ${f.file}:${f.line}: ${f.msg}`), `- Media a revisar: ${sec.medium.length}`, ...sec.medium.map(f => `  - ${f.id} ${f.file}:${f.line}: ${f.msg}`), `- Baja: ${sec.low.length}`, ...(sec.accepted.length ? [`- Riesgos aceptados: ${sec.accepted.map(a => a.id + ' (' + a.why + ')').join('; ')}`] : []), ...(sec.deps.length ? [`- Dependencias tocadas: ${sec.deps.length}`, ...sec.deps.map(f => `  - ${f.file}:${f.line}: ${f.msg}`)] : [])]),
  '',
  '## Decisiones para registrar como ADR', ...(adrPend.length ? adrPend : ['(ninguna marcada con [ADR])']), ...(adrBad.length ? ['ADR incompletos:', ...adrBad] : []),
  '',
  '## Consumo medido', consumo, '',
  '## Verificaciones', ...(results.length ? results : ['- (sin scripts typecheck/lint/test en package.json)']),
  '',
].join('\n');
const dir = path.join(root, '.claude', '.feature-flow'); fs.mkdirSync(dir, { recursive: true });
const dest = path.join(dir, `${slug}-facts.md`); fs.writeFileSync(dest, out);
process.stdout.write(out + `\nGuardado en ${path.relative(root, dest).replace(/\\/g, '/')}\n`);
process.exit(results.some(r => r.includes('FALLA')) || !tg.ok || blocked ? 3 : 0);
