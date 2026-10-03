#!/usr/bin/env node
// Prueba de humo del kit. Funciona en Windows, macOS y Linux. Uso:
//   node smoke-test.js [--repo "C:\ruta\a\hub-csp"]
// Sin --repo prueba la carpeta repo/ del kit. Con --repo prueba el repo ya instalado.
// No escribe en tu repo: usa carpetas temporales para los casos de los hooks.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const i = args.indexOf('--repo');
const repo = path.resolve(i >= 0 ? args[i + 1] : path.join(__dirname, 'repo'));
const home = process.env.KIT_HOME_OVERRIDE || os.homedir();
const hooks = path.join(repo, '.claude', 'hooks');

const rows = [];
const add = (res, name, detail = '') => rows.push({ res, name, detail });
const check = (name, ok, detail = '') =>
  add(ok ? 'PASA' : 'FALLA', name, ok ? detail : `${detail} | salida: ${lastOut.trim().replace(/\s+/g, ' ').slice(0, 300)}`);

let lastOut = '';
function runNode(script, json, env = {}) {
  const r = spawnSync(process.execPath, [script], {
    input: json,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}${r.error ? ' [spawn: ' + r.error.message + ']' : ''}`;
  lastOut = out;
  return { code: r.status, out };
}

// --- Herramientas
const major = Number(process.versions.node.split('.')[0]);
check('Node 18 o superior', major >= 18, `v${process.versions.node}`);

const claude = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: true });
if (claude.status === 0) add('PASA', 'claude en PATH', (claude.stdout || '').trim());
else add('AVISO', 'claude no está en PATH de esta terminal', 'instalá Claude Code o abrí una terminal nueva');

const git = spawnSync('git', ['--version'], { encoding: 'utf8', shell: true });
check('git en PATH', git.status === 0, (git.stdout || '').trim());

if (process.platform === 'win32') {
  const where = spawnSync('where', ['bash'], { encoding: 'utf8', shell: true });
  const gitBash = fs.existsSync('C:\\Program Files\\Git\\bin\\bash.exe');
  const hasBash = where.status === 0 || gitBash;
  add(hasBash ? 'PASA' : 'AVISO', 'Git Bash (los hooks del kit corren en bash)', hasBash ? 'presente' : 'ausente: instalá Git for Windows; sin bash los hooks fallarían');
}

// --- Configuración
const settingsPath = path.join(repo, '.claude', 'settings.json');
let settings = null;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  check('settings.json es JSON válido', true, settingsPath);
} catch (e) {
  check('settings.json es JSON válido', false, String(e.message));
}
if (settings) {
  const all = Object.values(settings.hooks || {}).flatMap((g) => g.flatMap((x) => x.hooks || []));
  check('hooks definidos con command', all.length > 0 && all.every((h) => typeof h.command === 'string'), `${all.length} hooks`);
  // Ejecuta cada comando tal como lo haría Claude Code (forma shell, vía bash) con stdin mínimo y CLAUDE_PROJECT_DIR.
  const bashCandidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe']
    : ['bash'];
  const bash = bashCandidates.find((b) => b === 'bash' || fs.existsSync(b));
  if (!bash) add('AVISO', 'no se encontró bash: no se probaron los comandos de hooks end-to-end');
  else {
    const stdins = { SessionStart: '{}', PreToolUse: '{"tool_name":"Write","tool_input":{}}', Stop: '{"stop_hook_active":true}' };
    for (const [ev, groups] of Object.entries(settings.hooks || {})) {
      for (const g of groups) for (const h of g.hooks || []) {
        const r = spawnSync(bash, ['-c', h.command], { input: stdins[ev] || '{}', encoding: 'utf8', cwd: repo, env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
        const out = `${r.stdout || ''}${r.stderr || ''}`.trim().replace(/\s+/g, ' ').slice(0, 200);
        check(`comando del hook ${ev} corre end-to-end`, r.status === 0, `exit=${r.status} ${r.status === 0 ? '' : out}`);
      }
    }
  }
  const deny = (settings.permissions && settings.permissions.deny) || [];
  check('deny de lectura para .env', deny.includes('Read(.env)'));
}

// --- protect-files
const pf = path.join(hooks, 'protect-files.cjs');
if (fs.existsSync(pf)) {
  const cases = [
    ['bloquea .env', { file_path: 'C:\\p\\.env', content: 'A=1' }, 2],
    ['permite .env.example', { file_path: 'C:\\p\\.env.example', content: 'A=' }, 0],
    ['bloquea ruta de Windows dentro de .git', { file_path: 'C:\\p\\.git\\config', new_string: 'x' }, 2],
    ['bloquea lockfile', { file_path: 'package-lock.json', new_string: 'x' }, 2],
    ['bloquea client secret literal', { file_path: 'src\\a.ts', content: 'const client_secret = "abcd1234efgh5678";' }, 2],
    ['bloquea AccountKey', { file_path: 'src\\a.ts', new_string: 'AccountKey=abcdefghijklmnopqrstuvwxyz0123456789ABCD==' }, 2],
    ['permite código normal', { file_path: 'src\\a.ts', content: 'const s = process.env.SECRET;' }, 0],
  ];
  for (const [name, tool_input, want] of cases) {
    const r = runNode(pf, JSON.stringify({ tool_name: 'Write', tool_input }));
    check(`protect-files: ${name}`, r.code === want, `exit=${r.code} (esperado ${want})`);
  }
} else add('FALLA', 'protect-files.cjs existe', pf);

// --- rehydrate
const rh = path.join(hooks, 'rehydrate.cjs');
if (fs.existsSync(rh)) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-rh-'));
  fs.mkdirSync(path.join(tmp, 'docs'));
  fs.writeFileSync(path.join(tmp, 'docs', 'STATE.md'), '# STATE prueba\n- decision: X\n');
  const r = runNode(rh, JSON.stringify({ cwd: tmp }), { CLAUDE_PROJECT_DIR: tmp });
  check('rehydrate: imprime el STATE', r.code === 0 && r.out.includes('STATE prueba'), `exit=${r.code}`);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-rh0-'));
  const r0 = runNode(rh, JSON.stringify({ cwd: empty }), { CLAUDE_PROJECT_DIR: empty });
  check('rehydrate: sin STATE no imprime nada', r0.code === 0 && r0.out.trim() === '', `exit=${r0.code}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(empty, { recursive: true, force: true });
} else add('FALLA', 'rehydrate.cjs existe', rh);

// --- stop-verify
const sv = path.join(hooks, 'stop-verify.cjs');
if (fs.existsSync(sv) && git.status === 0) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-sv-'));
  const sh = (a) => spawnSync('git', a, { cwd: tmp, encoding: 'utf8', shell: true });
  sh(['init', '-q']);
  const pkg = (scripts) => fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 't', scripts }));
  pkg({ typecheck: 'node -e "process.exit(1)"', lint: 'node -e "process.exit(0)"' });
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(path.join(tmp, 'src', 'a.ts'), 'x'); // en subcarpeta nueva: git la muestra colapsada sin -uall
  const env = { CLAUDE_PROJECT_DIR: tmp };
  let r = runNode(sv, JSON.stringify({ cwd: tmp }), env);
  check('stop-verify: bloquea si typecheck falla con cambios de código', r.code === 2, `exit=${r.code}`);
  r = runNode(sv, JSON.stringify({ cwd: tmp, stop_hook_active: true }), env);
  check('stop-verify: no entra en bucle (stop_hook_active)', r.code === 0, `exit=${r.code}`);
  pkg({});
  r = runNode(sv, JSON.stringify({ cwd: tmp }), env);
  check('stop-verify: sin scripts typecheck/lint no bloquea', r.code === 0, `exit=${r.code}`);
  fs.rmSync(tmp, { recursive: true, force: true });
} else add('AVISO', 'stop-verify no probado', 'falta el archivo o git');

// --- session-guard y feature-flow (límites contra abrir sesiones de más)
const sg = path.join(hooks, 'session-guard.cjs');
const launch = path.join(repo, '.claude', 'skills', 'feature-flow', 'scripts', 'launch.cjs');
if (fs.existsSync(sg)) {
  const g = (command, env) => runNode(sg, JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), env);
  const L = 'node .claude/skills/feature-flow/scripts/launch.cjs';
  const gc = [
    ['bloquea claude --bg', 'claude --bg -w x "p"', {}, 2],
    ['bloquea claude -p', 'claude -p "hola"', {}, 2],
    ['bloquea claude --worktree', 'cd r && claude --worktree x', {}, 2],
    ['permite claude agents', 'claude agents --json', {}, 0],
    ['permite claude --version', 'claude --version', {}, 0],
    ['permite el dry-run del lanzador', `${L} --slug a`, {}, 0],
    ['una sesión hija no puede lanzar', `${L} --slug a --launch`, { FEATURE_FLOW_CHILD: '1' }, 2],
    ['una sesión hija tampoco usa claude --bg directo', 'claude --bg x', { FEATURE_FLOW_CHILD: '1' }, 2],
  ];
  for (const [n, c, e, want] of gc) { const r = g(c, e); check(`session-guard: ${n}`, r.code === want, `exit=${r.code} (esperado ${want})`); }
  const ask = g(`${L} --slug a --launch`, {});
  check('session-guard: --launch pide confirmación humana', ask.code === 0 && ask.out.includes('"permissionDecision":"ask"'), `exit=${ask.code}`);
} else add('FALLA', 'session-guard.cjs existe', sg);

if (fs.existsSync(launch) && git.status === 0) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-ff-'));
  const bin = path.join(base, 'bin'); fs.mkdirSync(bin);
  const fake = path.join(bin, 'fake-claude.js');
  fs.writeFileSync(fake, `const fs=require('fs');const a=process.argv.slice(2);
if(a[0]==='agents'){console.log(process.env.FAKE_AGENTS||'[]');process.exit(0);}
fs.appendFileSync(process.env.FAKE_LOG,JSON.stringify(a)+'\\n');console.log('id abc123');`);
  const nodeBin = JSON.stringify(process.execPath).slice(1, -1);
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'claude.cmd'), `@"${process.execPath}" "${fake}" %*\r\n`);
  const log = path.join(base, 'launches.log');
  const sh = (cwd, a) => spawnSync('git', a, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  const mk = (name, specLen = 300) => {
    const d = path.join(base, name); fs.mkdirSync(d);
    sh(d, ['init', '-q']); sh(d, ['config', 'user.email', 't@example.com']); sh(d, ['config', 'user.name', 't']);
    fs.mkdirSync(path.join(d, 'docs', 'features', 'foo'), { recursive: true });
    const f = (n, t) => fs.writeFileSync(path.join(d, 'docs', 'features', 'foo', n), t);
    f('SPEC.md', 'x'.repeat(specLen)); f('STATE.md', '# STATE-FOO\n- decision A\n'); f('HANDOFF.md', '# HANDOFF-FOO\nproximo paso: B\n');
    return d;
  };
  const commit = (d) => { sh(d, ['add', '.']); sh(d, ['commit', '-q', '-m', 'docs']); };
  const L = (d, argv, env = {}) => {
    const r = spawnSync(process.execPath, [launch, ...argv], { cwd: d, encoding: 'utf8', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, FAKE_LOG: log, ...env } });
    lastOut = `${r.stdout || ''}${r.stderr || ''}`; return { code: r.status, out: lastOut };
  };
  const bg = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ pid: i, kind: 'background', sessionId: String(i) })));

  let d = mk('r1');
  check('launch: rechaza si los documentos no están commiteados', L(d, ['--slug', 'foo']).code === 1);
  commit(d);
  let r = L(d, ['--slug', 'foo']);
  check('launch: dry-run no lanza nada', r.code === 0 && r.out.includes('Dry-run') && !fs.existsSync(log), `exit=${r.code}`);
  check('launch: slug inválido rechazado', L(d, ['--slug', '../x']).code === 1);
  check('launch: sesión hija rechazada', L(d, ['--slug', 'foo', '--launch'], { FEATURE_FLOW_CHILD: '1' }).code === 1);
  check('launch: sin poder contar sesiones, no lanza (falla cerrado)', L(d, ['--slug', 'foo', '--launch'], { FAKE_AGENTS: 'basura' }).code === 1 && !fs.existsSync(log));
  check('launch: tope de simultáneas', L(d, ['--slug', 'foo', '--launch'], { FAKE_AGENTS: bg(2) }).code === 1 && !fs.existsSync(log));
  check('launch: el techo fijo gana a la configuración', (() => {
    fs.mkdirSync(path.join(d, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(d, '.claude', 'feature-flow.json'), '{"maxConcurrent":99}');
    return L(d, ['--slug', 'foo', '--launch'], { FAKE_AGENTS: bg(3) }).code === 1;
  })());
  fs.rmSync(path.join(d, '.claude', 'feature-flow.json'));
  r = L(d, ['--slug', 'foo', '--launch'], { FAKE_AGENTS: bg(1) });
  const logged = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  check('launch: lanza con --bg, -w y -n', r.code === 0 && logged.includes('"--bg"') && logged.includes('"-w"') && logged.includes('"foo"'), `exit=${r.code}`);
  check('launch: segundo lanzamiento seguido rechazado (espera mínima)', L(d, ['--slug', 'foo', '--launch']).code === 1);
  const reg = path.join(d, '.claude', '.feature-flow', 'launches.json');
  fs.writeFileSync(reg, JSON.stringify([1, 2, 3].map((n) => ({ slug: 's' + n, at: Date.now() - (30 + n) * 60000 }))));
  r = L(d, ['--slug', 'foo', '--launch']);
  check('launch: tope diario', r.code === 1 && /hoy/.test(r.out), `exit=${r.code}`);
  d = mk('r2', 50); commit(d);
  check('launch: SPEC corto rechazado', L(d, ['--slug', 'foo']).code === 1);
  fs.rmSync(base, { recursive: true, force: true });
} else add('AVISO', 'launch.cjs no probado', 'falta el archivo o git');

// --- rehydrate de feature
if (fs.existsSync(rh) && git.status === 0) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-rf-'));
  const sh = (a) => spawnSync('git', a, { cwd: tmp, encoding: 'utf8', shell: process.platform === 'win32' });
  sh(['init', '-q']); sh(['config', 'user.email', 't@example.com']); sh(['config', 'user.name', 't']);
  fs.mkdirSync(path.join(tmp, 'docs', 'features', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'docs', 'features', 'foo', 'STATE.md'), '# STATE-FOO\n');
  fs.writeFileSync(path.join(tmp, 'docs', 'features', 'foo', 'HANDOFF.md'), '# HANDOFF-FOO\n');
  fs.writeFileSync(path.join(tmp, 'docs', 'STATE.md'), '# STATE-GENERAL\n');
  sh(['add', '.']); sh(['commit', '-q', '-m', 'x']);
  const run = (source) => runNode(rh, JSON.stringify({ cwd: tmp, source }), { CLAUDE_PROJECT_DIR: tmp });
  let r = run('startup');
  check('rehydrate: startup en rama sin feature no inyecta nada', r.code === 0 && r.out.trim() === '', `exit=${r.code}`);
  sh(['checkout', '-q', '-b', 'feature/foo']);
  r = run('startup');
  check('rehydrate: startup en la rama de la feature inyecta HANDOFF y STATE', r.out.includes('HANDOFF-FOO') && r.out.includes('STATE-FOO') && !r.out.includes('STATE-GENERAL'), `exit=${r.code}`);
  r = run('compact');
  check('rehydrate: compact inyecta el STATE general y la feature', r.out.includes('STATE-GENERAL') && r.out.includes('HANDOFF-FOO'), `exit=${r.code}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// --- feature-close (hechos y verificación de los documentos de cierre)
const fcDir = path.join(repo, '.claude', 'skills', 'feature-close', 'scripts');
if (fs.existsSync(path.join(fcDir, 'collect.cjs')) && git.status === 0) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-fc-'));
  const sh = (a) => spawnSync('git', a, { cwd: tmp, encoding: 'utf8', shell: process.platform === 'win32' });
  const W = (f, t) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), t); };
  const C = (script, argv = []) => {
    const r = spawnSync(process.execPath, [path.join(fcDir, script), ...argv], { cwd: tmp, encoding: 'utf8' });
    lastOut = `${r.stdout || ''}${r.stderr || ''}`; return { code: r.status, out: lastOut };
  };
  sh(['init', '-q']); sh(['config', 'user.email', 't@example.com']); sh(['config', 'user.name', 't']);
  W('README.md', 'base'); sh(['add', '.']); sh(['commit', '-q', '-m', 'base']); sh(['branch', '-M', 'main']);
  sh(['checkout', '-q', '-b', 'feature/foo']);
  W('docs/features/foo/SPEC.md', '# SPEC\n## Objetivo\nx\n## Fuera de alcance\nNo toca el login.\n');
  W('docs/features/foo/STATE.md', '# STATE\n\nEstado: en curso\n\n## Decisiones\n- usar cola\n');
  W('docs/features/foo/HANDOFF.md', 'h');
  sh(['add', '.']); sh(['commit', '-q', '-m', 'docs de la feature']);
  let r = C('collect.cjs');
  check('feature-close: sin commits de código rechaza', r.code === 1 && /solo tocan los docs|nada que documentar/.test(r.out), `exit=${r.code}`);
  W('src/cola.ts', 'export const q = 1;\n'); sh(['add', '.']); sh(['commit', '-q', '-m', 'agrega cola']);
  r = C('collect.cjs');
  check('feature-close: collect arma los FACTS (archivo, commit, fuera de alcance, decisión)', r.code === 0 && r.out.includes('`src/cola.ts`') && r.out.includes('agrega cola') && r.out.includes('No toca el login') && r.out.includes('usar cola'), `exit=${r.code}`);
  check('feature-close: collect no cuenta los docs de la feature como cambios', !r.out.includes('docs/features/foo/SPEC.md'));
  W('stray.txt', 'x');
  check('feature-close: cambios sin commitear fuera de docs rechazan', C('collect.cjs').code === 1);
  fs.rmSync(path.join(tmp, 'stray.txt'));
  check('feature-close: verify rechaza si faltan los documentos', C('verify.cjs').code === 1);
  const design = (extra = '') => '# F\n## Resumen\nr\n## Flujo de punta a punta\n1. `src/cola.ts` encola.\n## Componentes y archivos\n| `src/cola.ts` | cola |\n## Configuración\nNinguna\n## Cómo verificar\nnpm test\n## Diferencias contra el SPEC\nNinguna\n## Sin verificar\nNinguna\n' + extra;
  const clog = '# Changelog\n## Sin publicar\n<!-- feature:foo -->\n### Cola\n- **Agregado:** cola\n';
  W('docs/design/foo.md', design()); W('docs/CHANGELOG.md', clog);
  check('feature-close: verify rechaza si el STATE no está cerrado', C('verify.cjs').code === 1);
  W('docs/features/foo/STATE.md', '# STATE\n\nEstado: cerrada (2026-10-03)\n');
  r = C('verify.cjs');
  check('feature-close: verify acepta documentos completos', r.code === 0, `exit=${r.code}`);
  W('docs/design/foo.md', design('Usa `src/no-existe.ts`.\n'));
  r = C('verify.cjs');
  check('feature-close: verify detecta una ruta citada que no existe', r.code === 1 && r.out.includes('src/no-existe.ts'), `exit=${r.code}`);
  W('docs/design/foo.md', design('Tenant 3f2504e0-4f89-41d3-9a0c-0305e82c3301.\n'));
  check('feature-close: verify detecta GUID de tenant', C('verify.cjs').code === 1);
  W('docs/design/foo.md', design().replace('## Sin verificar\nNinguna\n', '## Sin verificar\n'));
  check('feature-close: verify detecta sección vacía', C('verify.cjs').code === 1);
  fs.rmSync(tmp, { recursive: true, force: true });
} else add('AVISO', 'feature-close no probado', 'falta el archivo o git');

// --- Skills y subagentes
const fm = (p) => fs.existsSync(p) && fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').startsWith('---');
for (const s of ['app-architecture-review', 'pr-prep', 'spec-interview', 'feature-flow', 'feature-close']) {
  check(`skill del repo: ${s}`, fm(path.join(repo, '.claude', 'skills', s, 'SKILL.md')));
}
for (const a of ['reviewer', 'explorer']) check(`subagente: ${a}`, fm(path.join(repo, '.claude', 'agents', `${a}.md`)));
for (const s of ['context-ledger', 'azure-claim-check', 'client-deliverables', 'deliverable-review', 'azure-inventory-kql']) {
  const p = path.join(home, '.claude', 'skills', s, 'SKILL.md');
  if (fm(p)) add('PASA', `skill personal instalada: ${s}`);
  else add('AVISO', `skill personal no instalada: ${s}`, 'corré install.js');
}
if (fs.existsSync(path.join(home, '.claude', 'statusline.cjs'))) add('PASA', 'statusline.cjs instalado');
else add('AVISO', 'statusline.cjs no instalado', 'corré install.js');

// --- Reporte
const w = Math.max(...rows.map((r) => r.name.length));
for (const r of rows) console.log(`${r.res.padEnd(6)} ${r.name.padEnd(w)}  ${r.detail}`);
const fails = rows.filter((r) => r.res === 'FALLA').length;
const warns = rows.filter((r) => r.res === 'AVISO').length;
console.log(`\nResultado: ${rows.filter((r) => r.res === 'PASA').length} pasan, ${fails} fallan, ${warns} avisos. Plataforma: ${process.platform}, Node ${process.versions.node}.`);
process.exit(fails ? 1 : 0);
