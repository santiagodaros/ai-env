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

// --- Skills y subagentes
const fm = (p) => fs.existsSync(p) && fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').startsWith('---');
for (const s of ['app-architecture-review', 'pr-prep', 'spec-interview']) {
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
