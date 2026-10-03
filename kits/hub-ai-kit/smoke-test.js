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
  const sh = (cwd, a) => spawnSync('git', a, { cwd, encoding: 'utf8', shell: false });
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
  const bd = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-lb-'));
  fs.writeFileSync(path.join(bd, 'latest.json'), JSON.stringify({ at: Date.now(), fiveHour: { pct: 95, resetsAt: Math.floor(Date.now() / 1000) + 7200 }, sevenDay: null }));
  r = L(d, ['--slug', 'foo', '--launch'], { CLAUDE_BUDGET_DIR: bd });
  check('launch: sin margen en el límite de 5 h no lanza', r.code === 1 && /SIN MARGEN/.test(r.out) && !fs.existsSync(log), `exit=${r.code}`);
  check('launch: el dry-run informa el presupuesto', L(d, ['--slug', 'foo'], { CLAUDE_BUDGET_DIR: bd }).out.includes('Presupuesto'));
  fs.rmSync(bd, { recursive: true, force: true });
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
  const sh = (a) => spawnSync('git', a, { cwd: tmp, encoding: 'utf8', shell: false });
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
  const sh = (a) => spawnSync('git', a, { cwd: tmp, encoding: 'utf8', shell: false });
  const W = (f, t) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), t); };
  const C = (script, argv = []) => {
    const r = spawnSync(process.execPath, [path.join(fcDir, script), ...argv], { cwd: tmp, encoding: 'utf8' });
    lastOut = `${r.stdout || ''}${r.stderr || ''}`; return { code: r.status, out: lastOut };
  };
  sh(['init', '-q']); sh(['config', 'user.email', 't@example.com']); sh(['config', 'user.name', 't']);
  W('README.md', 'base'); sh(['add', '.']); sh(['commit', '-q', '-m', 'base']); sh(['branch', '-M', 'main']);
  sh(['checkout', '-q', '-b', 'feature/foo']);
  W('docs/features/foo/SPEC.md', '# SPEC\n## Objetivo\n' + 'Agregar una cola de trabajos para procesar tareas largas sin bloquear la API. '.repeat(3) + '\n## Fuera de alcance\nNo toca el login.\n');
  W('docs/features/foo/STATE.md', '# STATE\n\nEstado: en curso\n\n## Decisiones\n- usar cola\n');
  W('docs/features/foo/HANDOFF.md', 'h');
  sh(['add', '.']); sh(['commit', '-q', '-m', 'docs de la feature']);
  let r = C('collect.cjs');
  check('feature-close: sin commits de código rechaza', r.code === 1 && /solo tocan los docs|nada que documentar/.test(r.out), `exit=${r.code}`);
  const S = (slug) => { const x = spawnSync(process.execPath, [path.join(repo, '.claude', 'skills', 'feature-run', 'scripts', 'stage.cjs'), '--slug', slug], { cwd: tmp, encoding: 'utf8' }); lastOut = `${x.stdout}${x.stderr}`; try { return JSON.parse(x.stdout).stage; } catch { return 'error'; } };
  check('feature-run: sin documentos la etapa es spec', S('bar') === 'error' || S('bar') === 'spec');
  check('feature-run: con SPEC corto la etapa es spec', (() => { W('docs/features/baz/SPEC.md', 'corto'); W('docs/features/baz/STATE.md', 's'); W('docs/features/baz/HANDOFF.md', 'h'); return S('baz') === 'spec'; })());
  fs.rmSync(path.join(tmp, 'docs', 'features', 'baz'), { recursive: true, force: true });
  check('feature-run: sin commits de código la etapa es implement', S('foo') === 'implement');
  W('src/cola.ts', 'export const q = 1;\n'); sh(['add', '.']); sh(['commit', '-q', '-m', 'agrega cola']);
  r = C('collect.cjs');
  check('feature-close: la compuerta rechaza código sin pruebas', r.code === 3 && /ningún archivo de prueba/.test(r.out), `exit=${r.code}`);
  check('feature-run: código sin pruebas queda en la etapa tests', S('foo') === 'tests');
  W('docs/features/foo/STATE.md', '# STATE\n\nEstado: en curso\nSin pruebas: es solo una constante de ejemplo\n\n## Decisiones\n- usar cola\n');
  r = C('collect.cjs');
  check('feature-close: una exención declarada pasa y queda registrada', r.code === 0 && r.out.includes('exención declarada'), `exit=${r.code}`);
  W('docs/features/foo/STATE.md', '# STATE\n\nEstado: en curso\n\n## Decisiones\n- usar cola\n');
  W('src/cola.test.ts', 'test("q", () => {});\n'); sh(['add', '.']); sh(['commit', '-q', '-m', 'prueba de cola']);
  check('feature-run: con pruebas y sin cierre la etapa es close', S('foo') === 'close');
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
  check('feature-run: documentos cerrados sin PR.md la etapa es pr', S('foo') === 'pr');
  r = C('pr-body.cjs');
  const prmd = fs.existsSync(path.join(tmp, 'docs', 'features', 'foo', 'PR.md')) ? fs.readFileSync(path.join(tmp, 'docs', 'features', 'foo', 'PR.md'), 'utf8') : '';
  check('feature-close: pr-body arma título y secciones desde los documentos', r.code === 0 && prmd.includes('<!-- title: Cola -->') && prmd.includes('## Cómo verificar') && prmd.includes('## Verificaciones'), `exit=${r.code}`);
  check('feature-run: con PR.md la etapa es done', S('foo') === 'done');
  W('docs/design/foo.md', design('Usa `src/no-existe.ts`.\n'));
  r = C('verify.cjs');
  check('feature-close: verify detecta una ruta citada que no existe', r.code === 1 && r.out.includes('src/no-existe.ts'), `exit=${r.code}`);
  W('docs/design/foo.md', design('Tenant ' + ['3f2504e0', '4f89', '41d3', '9a0c', '0305e82c3301'].join('-') + '.\n'));
  check('feature-close: verify detecta GUID de tenant', C('verify.cjs').code === 1);
  W('docs/design/foo.md', design().replace('## Sin verificar\nNinguna\n', '## Sin verificar\n'));
  check('feature-close: verify detecta sección vacía', C('verify.cjs').code === 1);
  fs.rmSync(tmp, { recursive: true, force: true });
} else add('AVISO', 'feature-close no probado', 'falta el archivo o git');

// --- presupuesto del límite de 5 h (statusline -> latest.json -> budget.cjs)
const slPath = path.join(__dirname, 'personal', 'statusline.cjs');
const bpPath = path.join(repo, '.claude', 'skills', 'budget-plan', 'scripts', 'budget.cjs');
if (fs.existsSync(slPath) && fs.existsSync(bpPath) && git.status === 0) {
  const bdir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-bd-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-bp-'));
  spawnSync('git', ['init', '-q'], { cwd: proj, shell: false });
  const inFuture = Math.floor(Date.now() / 1000) + 3 * 3600;
  const feed = (pct, resets = inFuture) => {
    const r = spawnSync(process.execPath, [slPath], { input: JSON.stringify({ model: { display_name: 'M' }, session_id: 's1', cost: { total_cost_usd: 1.5 }, rate_limits: { five_hour: { used_percentage: pct, resets_at: resets }, seven_day: { used_percentage: 20, resets_at: resets + 99999 } } }), encoding: 'utf8', env: { ...process.env, CLAUDE_BUDGET_DIR: bdir } });
    lastOut = r.stdout || ''; return r.stdout || '';
  };
  const B = (argv) => { const r = spawnSync(process.execPath, [bpPath, ...argv, '--json'], { cwd: proj, encoding: 'utf8', env: { ...process.env, CLAUDE_BUDGET_DIR: bdir } }); lastOut = `${r.stdout}${r.stderr}`; let j = {}; try { j = JSON.parse(r.stdout); } catch { /* texto */ } return { code: r.status, j }; };
  let o = feed(40);
  check('statusline: muestra 5h y reinicio', o.includes('5h 40%') && o.includes('reinicia en'), o.trim());
  check('statusline: guarda la foto en latest.json', fs.existsSync(path.join(bdir, 'latest.json')));
  check('budget: status calcula el libre', B(['status']).j.freePct === 60);
  check('budget: sin historial el plan lo dice y no inventa', B(['plan']).j.status === 'sin-estimacion');
  const meas = (slug, a, b) => { feed(a); B(['start', slug]); feed(b); return B(['end', slug]).j; };
  check('budget: mide una feature (start/end)', meas('f1', 10, 25).deltaPct === 15);
  meas('f2', 25, 55); meas('f3', 55, 70); // 30 y 15
  const est = B(['estimate']).j;
  check('budget: estimación con 3 medidas = p75', est.n === 3 && est.pct === 30, JSON.stringify(est));
  feed(20); check('budget: alcanza con margen', B(['plan']).j.status === 'alcanza');
  feed(55); check('budget: justo', B(['plan']).j.status === 'justo');
  feed(75);
  let p = B(['plan']); check('budget: no alcanza y propone rebanadas', p.j.status === 'no-alcanza' && /rebanadas/.test(p.j.text), p.j.status);
  check('budget: check sale con código 4 si no alcanza', B(['check']).code === 4);
  feed(95); check('budget: sin margen bajo la reserva', B(['plan']).j.status === 'sin-margen');
  feed(30, Math.floor(Date.now() / 1000) + 600); B(['start', 'f4']); feed(5, Math.floor(Date.now() / 1000) + 5 * 3600);
  check('budget: una medición que cruza el reinicio se descarta', B(['end', 'f4']).j.valid === false);
  fs.rmSync(path.join(bdir, 'latest.json'));
  check('budget: sin datos no inventa', B(['plan']).j.status === 'sin-datos' && B(['plan']).code === 0);
  fs.rmSync(bdir, { recursive: true, force: true }); fs.rmSync(proj, { recursive: true, force: true });
} else add('AVISO', 'presupuesto no probado', 'falta statusline, budget.cjs o git');

// --- arch-first, adr, security-diff, project-init
const A = path.join(repo, '.claude', 'skills');
const needAll = ['arch-first', 'adr', 'security-diff', 'project-init'].every((s) => fs.existsSync(path.join(A, s)));
if (needAll && git.status === 0) {
  const mkproj = () => { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-ar-')); for (const s of ['arch-first', 'adr']) fs.cpSync(path.join(A, s), path.join(p, '.claude', 'skills', s), { recursive: true }); return p; };
  const N = (p, script, argv = [], env = {}) => { const r = spawnSync(process.execPath, [script, ...argv], { cwd: p, encoding: 'utf8', env: { ...process.env, ...env } }); lastOut = `${r.stdout || ''}${r.stderr || ''}`; return { code: r.status, out: lastOut }; };
  const sk = (p, s, f) => path.join(p, '.claude', 'skills', s, 'scripts', f);
  const guard = (p, tool_input) => { const r = runNode(path.join(hooks, 'arch-guard.cjs'), JSON.stringify({ tool_name: 'Write', tool_input, cwd: p }), { CLAUDE_PROJECT_DIR: p }); return r.code; };
  const proj = mkproj();
  let r = N(proj, sk(proj, 'arch-first', 'scaffold.cjs'), ['--type', 'api', '--lang', 'ts', '--name', 'demo']);
  const hasCode = (function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).some((e) => e.name === 'node_modules' || e.name === '.claude' ? false : e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|js|py|ps1)$/.test(e.name)); })(proj);
  check('arch-first: scaffold crea esqueleto, ADR 0001 y no escribe código', r.code === 0 && fs.existsSync(path.join(proj, 'architecture.json')) && fs.existsSync(path.join(proj, 'docs', 'decisions', 'README.md')) && fs.readdirSync(path.join(proj, 'docs', 'decisions')).some((f) => f.startsWith('0001-')) && !hasCode, `exit=${r.code}`);
  check('arch-first: scaffold no pisa un architecture.json existente', N(proj, sk(proj, 'arch-first', 'scaffold.cjs'), ['--type', 'api', '--lang', 'ts', '--name', 'demo']).code === 1);
  check('arch-guard: sin aprobación bloquea código', guard(proj, { file_path: 'src/domain/a.ts', content: 'export const a = 1;' }) === 2);
  check('arch-guard: Claude no puede sellar la aprobación', guard(proj, { file_path: 'docs/architecture/ARCHITECTURE.md', new_string: 'Estado: aprobada (2026-01-01)' }) === 2);
  check('arch-guard: permite documentos y pruebas sin aprobación', guard(proj, { file_path: 'docs/architecture/ARCHITECTURE.md', content: '# x' }) === 0 && guard(proj, { file_path: 'tests/a.test.ts', content: 'x' }) === 0);
  check('approve: rechaza si quedan secciones "(completar)"', N(proj, sk(proj, 'arch-first', 'approve.cjs')).code === 1);
  // completar el diseño como lo haría el modelo
  const cj = path.join(proj, 'architecture.json'); const cfgj = JSON.parse(fs.readFileSync(cj, 'utf8'));
  cfgj.ports = { driving: [{ name: 'CrearInforme', adapter: 'Ruta HTTP POST /informes' }], driven: [{ name: 'RepositorioInformes', adapter: 'Azure Resource Graph' }] };
  fs.writeFileSync(cj, JSON.stringify(cfgj, null, 2));
  const mdp = path.join(proj, 'docs', 'architecture', 'ARCHITECTURE.md');
  fs.writeFileSync(mdp, fs.readFileSync(mdp, 'utf8').replace(/\(completar[^\n]*\)/g, 'Completo.'));
  r = N(proj, sk(proj, 'arch-first', 'preview.cjs'));
  const html = fs.existsSync(path.join(proj, 'docs', 'architecture', 'preview.html')) ? fs.readFileSync(path.join(proj, 'docs', 'architecture', 'preview.html'), 'utf8') : '';
  check('arch-first: preview genera diagrama y avisa que falta aprobar', r.code === 0 && html.includes('<svg') && html.includes('CrearInforme') && html.includes('Sin aprobar'), `exit=${r.code}`);
  N(proj, sk(proj, 'arch-first', 'preview.cjs'), ['--artifact']);
  check('arch-first: preview --artifact es un fragmento con <title>', /^<title>/.test(fs.readFileSync(path.join(proj, 'docs', 'architecture', 'preview.artifact.html'), 'utf8')));
  check('approve: con el diseño completo aprueba y sella', N(proj, sk(proj, 'arch-first', 'approve.cjs')).code === 0 && /^Aprobada-hash: [0-9a-f]{64}$/m.test(fs.readFileSync(mdp, 'utf8')));
  const G = (f, c) => guard(proj, { file_path: f, content: c });
  check('arch-guard: aprobada permite dominio puro', G('src/domain/a.ts', "export const a = 1;\n") === 0);
  check('arch-guard: aplicación puede importar dominio', G('src/application/uc.ts', "import { a } from '../domain/a';\nexport const u = a;\n") === 0);
  check('arch-guard: dominio no importa adaptadores', G('src/domain/b.ts', "import { x } from '../adapters/outbound/repo';\n") === 2);
  check('arch-guard: dominio no importa infraestructura (axios)', G('src/domain/b.ts', "import axios from 'axios';\n") === 2);
  check('arch-guard: dominio no lee variables de entorno', G('src/domain/b.ts', 'const k = process.env.KEY;\n') === 2);
  check('arch-guard: entrada no importa salida', G('src/adapters/inbound/route.ts', "import { r } from '../outbound/repo';\n") === 2);
  check('arch-guard: salida sí puede leer el entorno y usar axios', G('src/adapters/outbound/repo.ts', "import axios from 'axios';\nconst k = process.env.KEY;\n") === 0);
  check('arch-guard: código fuera de las capas bloqueado', G('src/suelto.ts', 'export const s = 1;\n') === 2);
  check('arch-guard: scripts/ queda permitido', G('scripts/tool.ts', 'export const s = 1;\n') === 0);
  const sg2 = runNode(path.join(hooks, 'session-guard.cjs'), JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'node .claude/skills/arch-first/scripts/approve.cjs' } }));
  check('session-guard: Claude no puede correr approve.cjs', sg2.code === 2, `exit=${sg2.code}`);
  // arch-check sobre archivos reales
  fs.mkdirSync(path.join(proj, 'src', 'domain'), { recursive: true }); fs.mkdirSync(path.join(proj, 'src', 'adapters', 'outbound'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'src', 'domain', 'a.ts'), 'export const a = 1;\n');
  check('arch-check: arquitectura limpia pasa', N(proj, sk(proj, 'arch-first', 'arch-check.cjs')).code === 0);
  fs.writeFileSync(path.join(proj, 'src', 'domain', 'mala.ts'), "import { x } from '../adapters/outbound/repo';\n");
  r = N(proj, sk(proj, 'arch-first', 'arch-check.cjs'));
  check('arch-check: detecta la violación con archivo y línea', r.code === 1 && /src[\\/]domain[\\/]mala\.ts:1/.test(r.out), `exit=${r.code}`);
  fs.unlinkSync(path.join(proj, 'src', 'domain', 'mala.ts'));
  cfgj.forbiddenInCore.push('lodash'); fs.writeFileSync(cj, JSON.stringify(cfgj, null, 2));
  check('arch-guard: cambiar architecture.json invalida la aprobación', G('src/domain/c.ts', 'export const c = 1;\n') === 2);
  // python y PowerShell
  const L = require(path.join(A, 'arch-first', 'scripts', 'archlib.cjs'));
  const pyCfg = { dir: '/x', layers: { domain: { paths: ['src/app/domain'], mayImport: ['domain'] }, application: { paths: ['src/app/application'], mayImport: ['domain', 'application'] }, outbound: { paths: ['src/app/adapters/outbound'], mayImport: ['application', 'domain', 'outbound'] } }, coreLayers: ['domain', 'application'], forbiddenInCore: ['requests'], envOnlyIn: ['outbound'], aliases: {}, allowOutside: ['tests/'] };
  for (const l of Object.values(pyCfg.layers)) l.mayImport = l.mayImport.slice();
  check('arch-check: Python, dominio importando un adaptador', L.checkText(pyCfg, 'src/app/domain/r.py', 'from app.adapters.outbound.repo import Repo\n').length === 1);
  check('arch-check: Python, dominio con requests', L.checkText(pyCfg, 'src/app/domain/r.py', 'import requests\n').length === 1);
  check('arch-check: Python, import relativo válido', L.checkText(pyCfg, 'src/app/application/u.py', 'from ..domain.r import R\n').length === 0);
  const psCfg = { ...pyCfg, layers: { domain: { paths: ['src/domain'], mayImport: ['domain'] }, outbound: { paths: ['src/adapters/outbound'], mayImport: ['outbound'] } }, forbiddenInCore: ['Az.'] };
  check('arch-check: PowerShell, dominio con dot-source de un adaptador', L.checkText(psCfg, 'src/domain/r.ps1', '. $PSScriptRoot\\..\\adapters\\outbound\\az.ps1\n').length === 1);
  check('arch-check: PowerShell, dominio con Import-Module Az.Accounts', L.checkText(psCfg, 'src/domain/r.ps1', 'Import-Module Az.Accounts\n').length === 1);
  fs.rmSync(proj, { recursive: true, force: true });

  // adr
  const ap = mkproj(); const AD = sk(ap, 'adr', 'adr.cjs');
  r = N(ap, AD, ['new', 'Usar cola de mensajes', '--root', ap, '--context', 'c', '--decision', 'd', '--alternatives', 'a', '--consequences', 'q']);
  check('adr: crea la decisión numerada y el índice', r.code === 0 && fs.existsSync(path.join(ap, 'docs', 'decisions', '0001-usar-cola-de-mensajes.md')) && fs.readFileSync(path.join(ap, 'docs', 'decisions', 'README.md'), 'utf8').includes('Usar cola de mensajes'));
  check('adr: check pasa con ADR completos', N(ap, AD, ['check', '--root', ap]).code === 0);
  N(ap, AD, ['new', 'Otra', '--root', ap]);
  check('adr: check falla con "(completar)"', N(ap, AD, ['check', '--root', ap]).code === 1);
  fs.rmSync(ap, { recursive: true, force: true });

  // security-diff
  const sp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-sd-'));
  const sg = (a) => spawnSync('git', a, { cwd: sp, encoding: 'utf8', shell: false });
  sg(['init', '-q']); sg(['config', 'user.email', 't@example.com']); sg(['config', 'user.name', 't']);
  fs.writeFileSync(path.join(sp, 'package.json'), '{"name":"t","dependencies":{}}\n'); sg(['add', '.']); sg(['commit', '-q', '-m', 'base']); sg(['branch', '-M', 'main']);
  const SC = path.join(A, 'security-diff', 'scripts', 'secscan.cjs');
  const scan = (extra = []) => { const x = spawnSync(process.execPath, [SC, '--range', 'main..HEAD', '--json', ...extra], { cwd: sp, encoding: 'utf8' }); lastOut = x.stdout + x.stderr; let j = {}; try { j = JSON.parse(x.stdout); } catch { /* sin json */ } return { code: x.status, j }; };
  sg(['checkout', '-q', '-b', 'f']);
  fs.writeFileSync(path.join(sp, 'a.ts'), ['const password = "Sup3rSecreta99";', 'const ok = process.env.PASSWORD;', 'const t = "abcd1234efgh"; // secscan-allow', 'el.innerHTML = x;', 'const r = await fetch("http://api.ejemplo-externo.net/x");', 'agent.rejectUnauthorized = true;', 'const o = { rejectUnauthorized: false };'].join('\n') + '\n');
  fs.writeFileSync(path.join(sp, 'package.json'), '{"name":"t","dependencies":{\n"left-pad": "^1.3.0"\n}}\n'); fs.writeFileSync(path.join(sp, 'pnpm-lock.yaml'), 'x\n');
  sg(['add', '.']); sg(['commit', '-q', '-m', 'f']);
  let s = scan();
  check('security-diff: secreto literal y TLS desactivado son alta y bloquean', s.code === 3 && s.j.high.some((f) => f.id === 'S001' && f.line === 1) && s.j.high.some((f) => f.id === 'S002' && f.line === 7), `exit=${s.code}`);
  check('security-diff: secscan-allow excluye la línea y process.env no es literal', !s.j.high.some((f) => f.line === 2 || f.line === 3));
  check('security-diff: XSS y URL sin cifrar quedan como media y baja', s.j.medium.some((f) => f.id === 'S005') && s.j.low.some((f) => f.id === 'S009'));
  check('security-diff: lista dependencias nuevas', s.j.deps.some((d) => /left-pad/.test(d.msg)));
  fs.writeFileSync(path.join(sp, 'STATE.md'), 'Riesgo aceptado: S001 es un valor de ejemplo en un archivo de demostración\nRiesgo aceptado: S002 solo en entorno local de pruebas\n');
  s = scan(['--state', 'STATE.md']);
  check('security-diff: un riesgo aceptado con motivo deja de bloquear y queda registrado', s.code === 0 && s.j.accepted.length === 2, `exit=${s.code}`);
  fs.rmSync(sp, { recursive: true, force: true });

  // project-init
  const ip = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-pi-'));
  fs.writeFileSync(path.join(ip, 'package.json'), JSON.stringify({ name: 'x', dependencies: { react: '18', express: '4' }, scripts: { test: 'x', build: 'y' } }));
  fs.writeFileSync(path.join(ip, 'CLAUDE.md'), '# Mi proyecto\nTexto propio.\n');
  const det = JSON.parse(N(ip, path.join(A, 'project-init', 'scripts', 'detect.cjs')).out);
  check('project-init: detecta stack, tipo sugerido y scripts faltantes', det.suggestedType.startsWith('web+api') && det.scripts.includes('test') && det.missingChecks.includes('typecheck'), det.suggestedType);
  const IN = path.join(A, 'project-init', 'scripts', 'init.cjs');
  check('project-init: sin --apply no escribe nada', N(ip, IN).code === 0 && !fs.existsSync(path.join(ip, 'docs', 'STATE.md')));
  N(ip, IN, ['--apply']);
  const cm = fs.readFileSync(path.join(ip, 'CLAUDE.md'), 'utf8');
  check('project-init: aplica sin pisar el texto propio y con scripts reales', cm.includes('Texto propio.') && cm.includes('npm run test') && !cm.includes('npm run lint:') && fs.existsSync(path.join(ip, 'docs', 'STATE.md')) && fs.readFileSync(path.join(ip, '.gitignore'), 'utf8').includes('.claude/.feature-flow/'));
  N(ip, IN, ['--apply']);
  check('project-init: es idempotente', (fs.readFileSync(path.join(ip, 'CLAUDE.md'), 'utf8').match(/commands:start/g) || []).length === 1);
  fs.rmSync(ip, { recursive: true, force: true });
} else add('AVISO', 'arch-first y compañía no probadas', 'faltan skills o git');

// --- Skills y subagentes
const fm = (p) => fs.existsSync(p) && fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').startsWith('---');
for (const s of ['app-architecture-review', 'pr-prep', 'spec-interview', 'feature-flow', 'feature-close', 'feature-run', 'budget-plan', 'arch-first', 'adr', 'security-diff', 'project-init']) {
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
if (process.env.GITHUB_ACTIONS) for (const r of rows.filter((x) => x.res === 'FALLA')) console.log(`::error title=smoke-test::${r.name} | ${String(r.detail).replace(/[\r\n%]+/g, ' ').slice(0, 400)}`);
const warns = rows.filter((r) => r.res === 'AVISO').length;
console.log(`\nResultado: ${rows.filter((r) => r.res === 'PASA').length} pasan, ${fails} fallan, ${warns} avisos. Plataforma: ${process.platform}, Node ${process.versions.node}.`);
process.exit(fails ? 1 : 0);
