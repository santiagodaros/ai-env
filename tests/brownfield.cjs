// /dev-flow:init en repos existentes (brownfield): árbol sucio (dirty-target frena, dirty-other avisa), rollback
// tras una falla a mitad, .gitattributes y .editorconfig solo si faltan, CRLF commiteado sin renormalizar,
// scripts en modo watch, brechas para el arnés (hygiene-plan), CI=1 al correr pruebas y el pre-commit nativo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function brownfield({ check }) {
  const DF = path.join(__dirname, '..', 'plugins', 'dev-flow');
  const I = path.join(DF, 'skills', 'init', 'scripts', 'init.cjs');
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aienv-bf-')));
  const home = path.join(tmp, 'home');
  const git = (cwd, a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  const w = (d, f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
  let n = 0;
  const repo = (files) => {
    const d = path.join(tmp, `r${n++}`); fs.mkdirSync(d);
    for (const a of [['init', '-q'], ['config', 'user.email', 't@example.com'], ['config', 'user.name', 't'], ['config', 'core.autocrlf', 'false']]) git(d, a);
    for (const [f, t] of Object.entries(files)) w(d, f, t);
    git(d, ['add', '-A']); git(d, ['commit', '-q', '-m', 'base']);
    return d;
  };
  const env = { ...process.env, AI_ENV_HOME: home };
  const J = (d, args, extra = {}) => { const r = spawnSync(process.execPath, [I, ...args], { cwd: d, encoding: 'utf8', env: { ...env, ...extra } }); let j = {}; try { j = JSON.parse(r.stdout); } catch { /* */ } return { code: r.status, j, out: `${r.stdout}${r.stderr}` }; };
  const planF = path.join(tmp, 'plan.json');
  const plan = (approved, answers = { mode: 'features' }) => fs.writeFileSync(planF, JSON.stringify({ v: 1, approved, answers }));
  const ts = Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`src/f${i}.ts`, `export const a${i} = () => {\n  return ${i};\n};\n`]));
  const base = () => repo({ 'package.json': JSON.stringify({ name: 'x', dependencies: { typescript: '5' }, scripts: { test: 'node --test' } }), 'CLAUDE.md': '# x\nTexto propio.\n', ...ts });

  // --- Árbol sucio
  let d = base();
  fs.appendFileSync(path.join(d, 'CLAUDE.md'), 'cambio sin commitear\n');
  w(d, 'src/otro.ts', 'export const z = 1;\n');
  plan(['claude-md', 'state']);
  let r = J(d, ['preview', '--plan', planF]);
  check('init: frena (dirty-target) si va a tocar un archivo con cambios sin commitear, y dice cuál', r.code === 1 && r.j.kind === 'dirty-target' && JSON.stringify(r.j.files) === '["CLAUDE.md"]', r.out.slice(0, 200));
  git(d, ['commit', '-q', '-am', 'wip']);
  r = J(d, ['detect']);
  check('init: otros archivos sucios solo se avisan (dirty-other) y se listan', r.j.summary.attention.includes('dirty-other') && r.j.summary.dirty.includes('src/otro.ts'));
  r = J(d, ['preview', '--plan', planF]);
  check('init: con los archivos que toca limpios, la vista previa sigue aunque haya otros cambios en curso', r.code === 0 && r.j.ok);
  const ap = J(d, ['apply', '--plan', planF, '--expect', r.j.stamp]);
  check('init: el commit propuesto deja afuera los cambios en curso (git commit -- <archivos>)', ap.j.nextCommit && !ap.j.nextCommit.files.includes('src/otro.ts') && / -- /.test(ap.j.nextCommit.command) && /git add -- /.test(ap.j.nextCommit.command));

  // --- Rollback
  d = base();
  const before = Object.fromEntries(['CLAUDE.md', 'package.json'].map((f) => [f, fs.readFileSync(path.join(d, f), 'utf8')]));
  plan(['gitignore', 'gitattributes', 'editorconfig', 'claude-md', 'state']);
  r = J(d, ['preview', '--plan', planF]);
  const rb = J(d, ['apply', '--plan', planF, '--expect', r.j.stamp], { AI_ENV_INIT_FAIL_AT: 'docs/STATE.md' });
  const clean = git(d, ['status', '--porcelain', '--untracked-files=all']).stdout.trim() === '';
  check('init: si falla a mitad, revierte todo (borra lo creado, restaura lo agregado) y el repo queda como estaba', rb.code === 1 && rb.j.kind === 'rolled-back' && rb.j.reverted.length === 4 && clean && Object.entries(before).every(([f, t]) => fs.readFileSync(path.join(d, f), 'utf8') === t) && !fs.existsSync(path.join(d, 'docs')), rb.out.slice(0, 200));

  // --- .gitattributes y .editorconfig
  r = J(d, ['preview', '--plan', planF]);
  J(d, ['apply', '--plan', planF, '--expect', r.j.stamp]);
  const ga = fs.readFileSync(path.join(d, '.gitattributes'), 'utf8');
  check('init: .gitattributes con * text=auto y excepciones .sh LF y .cmd/.bat CRLF, sin forzar eol=lf en todo', /^\* text=auto$/m.test(ga) && /\*\.cmd text eol=crlf/.test(ga) && /\*\.sh text eol=lf/.test(ga) && !/^\* text=auto eol=lf/m.test(ga));
  const ec = fs.readFileSync(path.join(d, '.editorconfig'), 'utf8');
  check('init: .editorconfig con utf-8 y la indentación que ya usa el repo (2 espacios en .ts)', /charset = utf-8/.test(ec) && /\[\*\.ts\]\nindent_style = space\nindent_size = 2/.test(ec));
  d = repo({ '.gitattributes': '*.png binary\n', '.editorconfig': 'root = true\n[*]\nindent_style = tab\n', ...ts });
  plan(['gitattributes', 'editorconfig']);
  r = J(d, ['preview', '--plan', planF]);
  check('init: si ya existen, .gitattributes y .editorconfig se respetan tal cual', r.j.steps.every((s) => s.status === 'nothing') && fs.readFileSync(path.join(d, '.gitattributes'), 'utf8') === '*.png binary\n');

  // --- CRLF ya commiteado: se avisa y no se renormaliza
  d = repo({ 'run.cmd': 'echo hola\r\n', 'src/a.js': 'x\r\ny\r\n', 'README.md': 'x\n' });
  r = J(d, ['detect']);
  check('init: detecta archivos commiteados con CRLF (mixed-eol)', r.j.summary.attention.includes('mixed-eol') && r.j.summary.crlfFiles.includes('src/a.js'));
  plan(['gitattributes']);
  r = J(d, ['preview', '--plan', planF]);
  J(d, ['apply', '--plan', planF, '--expect', r.j.stamp]);
  const idx = git(d, ['ls-files', '--eol', 'src/a.js']).stdout;
  check('init: no renormaliza: el índice sigue con CRLF hasta que la persona decida', /^i\/crlf/.test(idx) && git(d, ['diff', '--cached', '--name-only']).stdout.trim() === '' && fs.existsSync(path.join(d, '.gitattributes')));

  // --- Modo watch y brechas para el arnés
  const watch = (test) => { const x = repo({ 'package.json': JSON.stringify({ name: 'x', scripts: { test } }), 'src/a.js': 'x\n' }); return J(x, ['detect']).j.detection.testWatch; };
  check('init: detecta scripts de prueba en modo watch (react-scripts, ng test, vitest sin run, --watch)', ['react-scripts test', 'ng test', 'vitest', 'jest --watch', 'jest --watchAll'].every((t) => watch(t)));
  check('init: no marca como watch los que terminan solos (vitest run, jest, node --test, ng test --watch=false, --watchAll=false)', ['vitest run', 'jest', 'node --test', 'ng test --watch=false', 'react-scripts test --watchAll=false'].every((t) => !watch(t)));
  d = repo({ 'package.json': JSON.stringify({ name: 'x', dependencies: { typescript: '5', vite: '5' }, scripts: { test: 'vitest' } }), ...ts });
  r = J(d, ['detect']);
  const gaps = r.j.summary.harnessGaps.map((g) => g.id);
  check('init: brechas para el arnés: test-watch, lint, typecheck (TypeScript) y build (vite)', ['test-watch', 'lint', 'typecheck', 'build'].every((g) => gaps.includes(g)) && r.j.summary.attention.includes('no-build') && r.j.summary.attention.includes('test-watch'));
  plan(['hygiene-plan']);
  check('init: hygiene-plan sin docs/STATE.md se niega (pide el paso state)', J(d, ['preview', '--plan', planF]).j.steps[0].status === 'refused');
  plan(['state', 'hygiene-plan']);
  r = J(d, ['preview', '--plan', planF]);
  J(d, ['apply', '--plan', planF, '--expect', r.j.stamp]);
  const st = fs.readFileSync(path.join(d, 'docs', 'STATE.md'), 'utf8');
  check('init: hygiene-plan anota las brechas en docs/STATE.md como primera feature, sin tocar package.json', /<!-- hygiene:start -->/.test(st) && /- \[ \] script `lint`/.test(st) && JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).scripts.lint === undefined);
  check('init: con todo aplicado, una segunda corrida no tiene nada para hacer', J(d, ['preview', '--plan', planF]).j.steps.every((s) => s.status === 'nothing'));

  // --- Pruebas siempre desatendidas: quick.cjs corre el script de test con CI=1
  d = repo({ 'package.json': JSON.stringify({ name: 'x', scripts: { test: "node -e \"process.exit(process.env.CI ? 0 : 1)\"" } }), 'src/a.js': 'exports.a = 1;\n', 'test/a.test.js': '1;\n' });
  w(d, 'src/a.js', 'exports.a = 2;\n'); w(d, 'test/a.test.js', '2;\n'); git(d, ['add', '-A']);
  const q = spawnSync(process.execPath, [path.join(DF, 'skills', 'quick-fix', 'scripts', 'quick.cjs'), '--json'], { cwd: d, encoding: 'utf8', env: { ...process.env, CI: '' } });
  let qj = {}; try { qj = JSON.parse(q.stdout); } catch { /* */ }
  check('quick-fix: corre las pruebas con CI=1 (react-scripts, ng test o vitest no se cuelgan en watch)', (qj.gates || []).some((g) => g.name === 'npm run test' && g.ok), JSON.stringify(qj.gates));
  check('feature-close y stop-verify también corren con CI=1', /CI: '1'/.test(fs.readFileSync(path.join(DF, 'skills', 'feature-close', 'scripts', 'collect.cjs'), 'utf8')) && /CI: '1'/.test(fs.readFileSync(path.join(DF, 'hooks', 'stop-verify.cjs'), 'utf8')));

  // --- Pre-commit nativo
  d = base();
  plan(['git-hook']);
  r = J(d, ['preview', '--plan', planF]);
  const gh = J(d, ['apply', '--plan', planF, '--expect', r.j.stamp]);
  const hookF = path.join(d, '.git', 'hooks', 'pre-commit');
  check('git-hook: instala el shim en .git/hooks y la copia autónoma fuera del plugin, sin entrar al commit', gh.code === 0 && fs.readFileSync(hookF, 'utf8').includes('ai-env: pre-commit') && fs.existsSync(path.join(home, '.claude', 'ai-env', 'git-hooks', 'secscan.cjs')) && gh.j.nextCommit === null);
  const commit = (files, msg) => { for (const [f, t] of Object.entries(files)) w(d, f, t); git(d, ['add', '-A']); return spawnSync('git', ['commit', '-q', '-m', msg], { cwd: d, encoding: 'utf8', env }); };
  let c = commit({ 'src/k.ts': `const k = "AKIA${'ABCDEFGHIJKLMNOP'}";\n` }, 'secreto');
  check('git-hook: un commit con una credencial se frena fuera de Claude Code', c.status !== 0 && /commit frenado/.test(c.stderr) && /S001/.test(c.stderr), c.stderr.slice(0, 200));
  git(d, ['reset', '-q', 'src/k.ts']); fs.rmSync(path.join(d, 'src', 'k.ts'));
  c = commit({ 'src/f1.ts': 'export const a1 = () => 2;\n' }, 'ok');
  check('git-hook: un commit limpio pasa', c.status === 0, c.stderr.slice(0, 200));
  const t0 = process.hrtime.bigint();
  spawnSync(process.execPath, [path.join(home, '.claude', 'ai-env', 'git-hooks', 'pre-commit.cjs')], { cwd: d, encoding: 'utf8', env });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  check('git-hook: tarda menos de 500 ms en un repo chico', ms < 500, `${Math.round(ms)} ms`);
  check('git-hook: una segunda corrida no tiene nada para hacer', J(d, ['preview', '--plan', planF]).j.steps[0].status === 'nothing');
  fs.writeFileSync(path.join(home, '.claude', 'ai-env', 'git-hooks', 'secscan.cjs'), '// vieja\n');
  const su = spawnSync(process.execPath, [path.join(DF, 'skills', 'setup', 'scripts', 'setup.cjs'), '--apply'], { encoding: 'utf8', env: { ...env, AI_ENV_HOME: home } });
  check('setup --apply actualiza la copia del pre-commit si quedó vieja', /actualizar el pre-commit/.test(su.stdout) && fs.readFileSync(path.join(home, '.claude', 'ai-env', 'git-hooks', 'secscan.cjs'), 'utf8') === fs.readFileSync(path.join(DF, 'skills', 'security-diff', 'scripts', 'secscan.cjs'), 'utf8'), su.stdout.slice(0, 200));
  d = base(); w(d, '.git/hooks/pre-commit', '#!/bin/sh\necho mio\n');
  plan(['git-hook']);
  check('git-hook: no pisa un pre-commit propio', J(d, ['preview', '--plan', planF]).j.steps[0].status === 'refused' && fs.readFileSync(path.join(d, '.git', 'hooks', 'pre-commit'), 'utf8').includes('mio'));
  d = repo({ '.husky/pre-commit': 'npx lint-staged\n', 'src/a.js': 'x\n' });
  r = J(d, ['preview', '--plan', planF]);
  check('git-hook: con husky (u otro gestor) no se instala y se avisa', r.j.steps[0].status === 'refused' && /husky/.test(r.j.steps[0].reason) && J(d, ['detect']).j.summary.attention.includes('git-hook-other'));
  fs.rmSync(tmp, { recursive: true, force: true });
};
