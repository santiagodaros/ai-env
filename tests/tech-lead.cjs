// Pruebas de la forma de trabajo Tech Lead + workers (dev-flow): PRD, tickets, estado, tarjeta, auditoría,
// honestidad de pruebas, worktrees, dispatch, session-guard, project-init --agents y setup --worktrees.
// Las llama tests/smoke-test.js. GitHub y Claude Code se reemplazan por falsos (no hay red ni sesiones reales).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function techLead({ check, add, run }) {
  const DF = path.join(__dirname, '..', 'plugins', 'dev-flow');
  const K = (skill, f) => path.join(DF, 'skills', skill, 'scripts', f);
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aienv-tl-'))); // ruta larga (Windows usa 8.3 en TEMP)
  const GHF = path.join(__dirname, 'fixtures', 'gh-fake.cjs');
  const git = (cwd, a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  const repo = (name) => {
    const d = path.join(tmp, name); fs.mkdirSync(d, { recursive: true });
    for (const a of [['init', '-q', '-b', 'main'], ['config', 'user.email', 't@example.com'], ['config', 'user.name', 't']]) git(d, a);
    return d;
  };
  const write = (d, f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
  const commit = (d, m) => { git(d, ['add', '-A']); git(d, ['commit', '-q', '-m', m]); };
  const json = (r) => { try { return JSON.parse(r.out); } catch { return {}; } };

  const PRD = `# PRD\n\n## [G-01] Stack\n- Node 22, pruebas con node --test.\n\n## [G-02] Restricciones\n- Toda llamada externa con timeout.\n\n## Requerimientos\n\n### [F-01] Resta\nAgregar resta(a, b). Ver ADR-0001 y NF-01.\n\n- [ ] resta(5, 2) devuelve 3\n- [ ] resta(2, 5) devuelve -3\n\n\`\`\`\n## [F-99] dentro de un bloque de código no cuenta\n\`\`\`\n\n### [F-02] Multiplicación\nSin criterios todavía.\n\n## [NF-01] Calidad\n- Pruebas que fallan sin el cambio.\n`;
  const ADR = '# ADR-0001: Sin dependencias\n\nEstado: aceptada\n\n## Contexto\nx\n\n## Decisión\nSolo la biblioteca estándar de Node.\n\n## Consecuencias\ny\n';

  // --- PRD
  const r1 = repo('prd');
  write(r1, 'docs/PRD.md', PRD); write(r1, 'docs/decisions/0001-sin-deps.md', ADR); commit(r1, 'prd');
  const P = K('prd', 'prd.cjs');
  let r = run(P, ['list', '--json'], { cwd: r1 });
  const ids = (json(r) || []).map ? json(r).map((x) => x.id) : [];
  check('prd: lista las secciones con id (ignora encabezados dentro de bloques de código)', JSON.stringify(ids) === JSON.stringify(['G-01', 'G-02', 'F-01', 'F-02', 'NF-01']), ids.join(','));
  r = run(P, ['slice', 'F-01', '--json'], { cwd: r1 });
  const sl = json(r);
  check('prd: la rebanada trae la sección, las globales, las citadas y la decisión del ADR', sl.text && /\[F-01\] Resta/.test(sl.text) && /\[G-02\]/.test(sl.text) && /\[NF-01\]/.test(sl.text) && /Solo la biblioteca estándar/.test(sl.text) && !/\[F-02\]/.test(sl.text));
  check('prd: la rebanada trae los criterios de aceptación', (sl.criteria || []).length === 2);
  r = run(P, ['check'], { cwd: r1 });
  check('prd: check avisa la sección F sin criterios y no da error por un id en un bloque de código', r.code === 0 && /F-02 no tiene criterios/.test(r.out) && !/F-99/.test(r.out));
  write(r1, 'docs/PRD.md', PRD + '\n### [F-01] Repetida\nCita X-77.\n');
  r = run(P, ['check'], { cwd: r1 });
  check('prd: check falla con ids repetidos y citas rotas', r.code === 1 && /F-01 repetido/.test(r.out) && /cita X-77/.test(r.out));
  write(r1, 'docs/PRD.md', PRD);
  const r1b = repo('prd-init');
  r = run(P, ['init'], { cwd: r1b });
  check('prd: init crea el esqueleto y no pisa uno existente', r.code === 0 && fs.existsSync(path.join(r1b, 'docs', 'PRD.md')) && /ya existe/.test(run(P, ['init'], { cwd: r1b }).out));

  // --- Tickets y estado con un gh falso
  const ghState = path.join(tmp, 'gh.json');
  const env = { AI_ENV_GH: JSON.stringify([process.execPath, GHF]), FAKE_GH_STATE: ghState };
  write(r1, '.claude/dev-flow.json', JSON.stringify({ state: 'docs/ESTADO.md' }));
  const T = K('ticket', 'ticket.cjs');
  r = run(T, ['create', 'F-01'], { cwd: r1, env });
  const st = () => JSON.parse(fs.readFileSync(ghState, 'utf8'));
  check('ticket: create arma el issue con la rebanada, criterios, contrato y etiquetas', r.code === 0 && st().issues.length === 1 && /Contrato de entrega/.test(st().issues[0].body) && /- \[ \] resta\(5, 2\)/.test(st().issues[0].body) && st().issues[0].labels.includes('prd:F-01') && st().issues[0].labels.includes('estado:listo'));
  r = run(T, ['create', 'F-01'], { cwd: r1, env });
  check('ticket: no duplica un issue abierto para el mismo id', r.code === 0 && /Ya hay un issue abierto/.test(r.out) && st().issues.length === 1);
  r = run(T, ['claim', '1'], { cwd: r1, env });
  check('ticket: claim asigna, pasa a "en curso" y devuelve rama y worktree', r.code === 0 && json(r).branch === 'feat/1-resta' && json(r).worktree === 'feat-1-resta' && st().issues[0].labels.includes('estado:en-curso') && !st().issues[0].labels.includes('estado:listo'));
  r = run(T, ['pr', '1', '--dry-run'], { cwd: r1, env });
  check('ticket: pr se niega fuera de la rama del ticket', r.code === 1 && /no es la del ticket/.test(r.out));
  r = run(K('ticket', 'estado.cjs'), ['--write'], { cwd: r1, env });
  const est = fs.existsSync(path.join(r1, 'docs', 'ESTADO.md')) ? fs.readFileSync(path.join(r1, 'docs', 'ESTADO.md'), 'utf8') : '';
  check('estado: escribe el bloque en el archivo configurado (docs/ESTADO.md) con cobertura del PRD', r.code === 0 && /<!-- estado:start -->/.test(est) && /Cobertura del PRD: 0\/3 cerrados/.test(est) && /\| F-01 \| Resta \| en-curso \| #1 \|/.test(est) && /\| F-02 \| Multiplicación \| sin ticket/.test(est));
  fs.writeFileSync(path.join(r1, 'docs', 'ESTADO.md'), est.replace('## Decisiones\n- ', '## Decisiones\n- usamos node --test'));
  run(K('ticket', 'estado.cjs'), ['--write'], { cwd: r1, env });
  check('estado: no toca lo escrito a mano fuera de las marcas', /usamos node --test/.test(fs.readFileSync(path.join(r1, 'docs', 'ESTADO.md'), 'utf8')));

  // --- Tarjeta de entrega
  const C = K('dispatch', 'card.cjs');
  const goodCard = { ticket: 1, branch: 'feat/1-resta', summary: 'Agrega resta(a, b) con dos pruebas que cubren los criterios.', files_changed: ['src/calc.js', 'test/calc.test.js'], commands: [{ cmd: 'npm test', exit: 0 }], tests: { command: 'npm test', passed: true, added: ['test/calc.test.js'], fail_without_change: 'si' }, acceptance: [{ criterion: 'resta(5, 2) devuelve 3', status: 'cumple', evidence: 'test/calc.test.js:4' }], blind_spots: ['No probé entradas no numéricas.'] };
  const cf = path.join(tmp, 'card.json');
  fs.writeFileSync(cf, JSON.stringify(goodCard));
  check('card: una tarjeta completa es válida', run(C, ['check', cf]).code === 0);
  fs.writeFileSync(cf, JSON.stringify({ ...goodCard, blind_spots: [], extra: 1, tests: { ...goodCard.tests, fail_without_change: 'quizas' } }));
  r = run(C, ['check', cf]);
  check('card: rechaza puntos ciegos vacíos, campos de más y valores fuera del enum', r.code === 1 && /blind_spots/.test(r.out) && /no permitido "extra"/.test(r.out) && /quizas/.test(r.out));
  fs.writeFileSync(cf, JSON.stringify({ result: 'listo', structured_output: goodCard }));
  r = run(C, ['extract', cf]);
  check('card: extract saca structured_output de la salida de claude -p', r.code === 0 && json(r).ticket === 1);
  fs.writeFileSync(cf, JSON.stringify({ result: 'Hecho.\n```json\n' + JSON.stringify(goodCard) + '\n```' }));
  check('card: extract también toma el último bloque ```json del texto', run(C, ['extract', cf]).code === 0);
  fs.writeFileSync(cf, JSON.stringify(goodCard));
  check('card: render arma la tarjeta en markdown para el PR', /## Tarjeta de entrega/.test(run(C, ['render', cf]).out) && /Puntos ciegos/.test(run(C, ['render', cf]).out));
  const verdict = { pr: 2, verdict: 'aprobar', summary: 'Cumple F-01 con pruebas honestas y sin hallazgos.', tests_honest: 'si', findings: [], checks: [{ name: 'audit.cjs', result: 'pasa' }] };
  fs.writeFileSync(cf, JSON.stringify(verdict));
  check('card: valida el veredicto del auditor con --verdict', run(C, ['check', cf, '--verdict']).code === 0 && run(C, ['check', cf]).code === 1);

  // --- Auditoría y honestidad de las pruebas sobre un repo real con node --test
  const r2 = repo('audit');
  write(r2, 'package.json', JSON.stringify({ name: 'x', scripts: { test: 'node --test' } }));
  write(r2, 'src/calc.js', 'exports.suma = (a, b) => a + b;\n');
  write(r2, 'test/calc.test.js', "const t = require('node:test'); const assert = require('node:assert');\nconst { suma } = require('../src/calc.js');\nt.test('suma', () => assert.strictEqual(suma(1, 2), 3));\n");
  commit(r2, 'base');
  git(r2, ['checkout', '-q', '-b', 'feat/1-resta']);
  fs.appendFileSync(path.join(r2, 'src', 'calc.js'), 'exports.resta = (a, b) => a - b;\n');
  fs.appendFileSync(path.join(r2, 'test', 'calc.test.js'), "t.test('resta', () => assert.strictEqual(require('../src/calc.js').resta(5, 2), 3));\n");
  commit(r2, 'resta');
  const H = K('audit', 'test-honesty.cjs');
  r = run(H, ['--json'], { cwd: r2 });
  check('test-honesty: pruebas que fallan sin el cambio → PASA', json(r).result === 'PASA', json(r).detail);
  check('test-honesty: deja el repo exactamente como estaba', !git(r2, ['status', '--porcelain']).stdout.trim());
  fs.writeFileSync(cf, JSON.stringify(goodCard));
  r = run(C, ['verify', cf, '--base', 'main', '--run-tests'], { cwd: r2 });
  check('card verify: la tarjeta coincide con el repo', r.code === 0, r.out);
  fs.writeFileSync(cf, JSON.stringify({ ...goodCard, files_changed: ['src/calc.js', 'src/otro.js'], tests: { ...goodCard.tests, passed: false } }));
  r = run(C, ['verify', cf, '--base', 'main', '--run-tests'], { cwd: r2 });
  check('card verify: detecta archivos no declarados, inexistentes y pruebas declaradas al revés', r.code === 1 && /no declara: test\/calc\.test\.js/.test(r.out) && /no cambiaron en la rama: src\/otro\.js/.test(r.out) && /pasan y la tarjeta dice lo contrario/.test(r.out));
  git(r2, ['checkout', '-q', 'main']); git(r2, ['checkout', '-q', '-b', 'feat/2-mult']);
  fs.appendFileSync(path.join(r2, 'src', 'calc.js'), 'exports.mult = (a, b) => a * b;\n');
  fs.appendFileSync(path.join(r2, 'test', 'calc.test.js'), "t.test('mult (no prueba nada)', () => assert.strictEqual(suma(2, 2), 4));\n");
  commit(r2, 'mult');
  r = run(H, ['--json'], { cwd: r2 });
  check('test-honesty: pruebas que pasan igual sin el cambio → FALLA (complacientes)', json(r).result === 'FALLA' && r.code === 1, json(r).detail);
  git(r2, ['checkout', '-q', 'main']); git(r2, ['checkout', '-q', '-b', 'feat/3-api']);
  write(r2, 'src/api.js', "exports.get = async (id, req) => {\n  const r = await fetch('https://x.example/items/' + id);\n  const q = `SELECT * FROM items WHERE id = ${id}`;\n  const body = JSON.parse(req.body);\n  return { r, q, body };\n};\n");
  write(r2, 'test/api.test.js', "const t = require('node:test'); const assert = require('node:assert');\nt.test.only('api', () => { assert.ok(true); });\n");
  commit(r2, 'api');
  r = run(K('audit', 'audit.cjs'), ['--json', '--no-honesty'], { cwd: r2 });
  const af = (json(r).findings || []).map((f) => f.id);
  check('audit: detecta fetch sin timeout, SQL interpolado, entrada sin esquema, .only y aserción trivial', ['fetch-sin-timeout', 'sql-concatenado', 'sin-validacion', 'test-only', 'asercion-trivial'].every((x) => af.includes(x)) && r.code === 1 && json(r).suggested === 'bloquear', af.join(','));
  git(r2, ['checkout', '-q', 'feat/1-resta']);
  r = run(K('audit', 'audit.cjs'), ['--json'], { cwd: r2 });
  check('audit: una rama limpia con pruebas honestas sugiere aprobar', r.code === 0 && json(r).suggested === 'aprobar' && json(r).tests_honest === 'si', JSON.stringify(json(r).findings || []).slice(0, 200));

  // --- Hook de worktrees
  const W = path.join(DF, 'hooks', 'worktree.cjs');
  const r3 = repo('wt');
  write(r3, '.env', 'SECRET=1\n'); write(r3, '.gitignore', '.env\n'); write(r3, '.worktreeinclude', '.env\n'); commit(r3, 'i');
  const hookRun = (mode, input, e = {}) => { const x = spawnSync(process.execPath, [W, mode], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, AI_ENV_HOME: tmp, ...e } }); return { code: x.status, out: (x.stdout || '').trim(), err: x.stderr || '' }; };
  let h = hookRun('create', { cwd: r3, name: 'feat-12-exportar' });
  check('worktree: sin configuración, igual que Claude Code (<repo>/.claude/worktrees) y rama de ticket', h.code === 0 && h.out === path.join(r3, '.claude', 'worktrees', 'feat-12-exportar') && git(h.out, ['branch', '--show-current']).stdout.trim() === 'feat/12-exportar', h.err);
  check('worktree: copia lo que pide .worktreeinclude', fs.existsSync(path.join(h.out, '.env')));
  check('worktree: dentro del repo, queda excluido de git (no se commitea como repo embebido)', !git(r3, ['status', '--porcelain']).stdout.includes('.claude/'));
  const again = hookRun('create', { cwd: r3, name: 'feat-12-exportar' });
  check('worktree: es idempotente (mismo nombre, misma ruta; dos registros no crean dos)', again.code === 0 && again.out === h.out);
  const wtRoot = path.join(tmp, 'wts');
  write(r3, '.claude/dev-flow.json', JSON.stringify({ worktrees: { root: wtRoot } }));
  h = hookRun('create', { cwd: r3, name: 'other name/raro' });
  check('worktree: con worktrees.root lo crea fuera del repo (<raíz>/<repo>/<nombre>) y sanea el nombre', h.code === 0 && h.out === path.join(wtRoot, 'wt', 'other-name-raro') && git(h.out, ['branch', '--show-current']).stdout.trim() === 'worktree-other-name-raro', h.err);
  if (process.platform !== 'win32') {
    const { spawn } = require('child_process');
    const sleeper = spawn('sleep', ['300'], { cwd: h.out, detached: true, stdio: 'ignore' });
    sleeper.unref();
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},400)']);
    const rm = hookRun('remove', { cwd: r3, name: 'other name/raro' });
    let aliveAfter = true;
    try { process.kill(sleeper.pid, 0); } catch { aliveAfter = false; }
    try { if (/\) Z /.test(fs.readFileSync(`/proc/${sleeper.pid}/stat`, 'utf8'))) aliveAfter = false; } catch { /* sin /proc o ya no existe */ }
    check('worktree: al borrar cierra los procesos con el directorio adentro y poda', rm.code === 0 && !fs.existsSync(path.join(wtRoot, 'wt', 'other-name-raro')) && !aliveAfter && /cerré 1 proceso/.test(rm.err), rm.err);
    try { process.kill(sleeper.pid, 'SIGKILL'); } catch { /* ya terminó */ }
  } else add('AVISO', 'worktree: cierre de procesos no probado en Windows en la prueba de humo', 'se prueba en la sesión real (docs/PRUEBA-REAL.md)');
  fs.rmSync(path.join(r3, '.claude', 'dev-flow.json'));
  r = run(W, ['gc'], { cwd: r3, env: { AI_ENV_HOME: tmp } });
  check('worktree gc: un worktree sin commits propios no se borra (puede haber un worker trabajando)', r.code === 0 && /dejar\s+.*feat-12-exportar.*sin commits propios/.test(r.out), r.out);
  const wtp = path.join(r3, '.claude', 'worktrees', 'feat-12-exportar');
  fs.writeFileSync(path.join(wtp, 'x.txt'), 'x'); commit(wtp, 'x'); git(r3, ['merge', '-q', 'feat/12-exportar']);
  r = run(W, ['gc', '--apply'], { cwd: r3, env: { AI_ENV_HOME: tmp } });
  check('worktree gc: con la rama ya mergeada borra el worktree y la rama local', r.code === 0 && !fs.existsSync(wtp) && !git(r3, ['branch', '--list', 'feat/12-exportar']).stdout.trim(), r.out);

  // --- dispatch con Claude Code y gh falsos
  const r4 = repo('disp');
  write(r4, 'docs/PRD.md', PRD); write(r4, 'docs/decisions/0001-sin-deps.md', ADR);
  write(r4, '.claude/dev-flow.json', JSON.stringify({ launch: { maxConcurrent: 2, maxPerDay: 10, cooldownMinutes: 2 } }));
  write(r4, '.claude/prompts/implementer.md', '# Reglas\n\n- Usar siempre node --test.\n');
  commit(r4, 'i');
  const gh4 = path.join(tmp, 'gh4.json');
  const fakeClaude = path.join(tmp, 'claude-falso.cjs');
  fs.writeFileSync(fakeClaude, `const fs=require('fs');const a=process.argv.slice(2);
if(a[0]==='agents'){console.log(process.env.FAKE_AGENTS||'[]');process.exit(0);}
fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(a)+'\\n');
let input='';try{input=fs.readFileSync(0,'utf8');}catch{}
fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, 'STDIN:'+input.length+'\\n');
console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,total_cost_usd:0.12,num_turns:7,result:'ok',structured_output:JSON.parse(process.env.FAKE_CARD)}));`);
  const clog = path.join(tmp, 'claude.log');
  const env4 = { AI_ENV_GH: JSON.stringify([process.execPath, GHF]), FAKE_GH_STATE: gh4, AI_ENV_CLAUDE: JSON.stringify([process.execPath, fakeClaude]), FAKE_CLAUDE_LOG: clog, FAKE_CARD: JSON.stringify(goodCard), AI_ENV_HOME: tmp, CLAUDE_BUDGET_DIR: path.join(tmp, 'budget-vacio') };
  run(T, ['create', 'F-01'], { cwd: r4, env: env4 });
  const D = K('dispatch', 'dispatch.cjs');
  r = run(D, ['run', '--issue', '1', '--role', 'implementer'], { cwd: r4, env: env4 });
  check('dispatch: el dry-run muestra cupos, worktree del ticket y prompt sin lanzar nada', r.code === 0 && /Dry-run/.test(r.out) && /Worktree: feat-1-resta/.test(r.out) && /Cupos: 0\/2/.test(r.out) && !fs.existsSync(clog));
  check('dispatch: el prompt lleva el ticket (rebanada del PRD) y no el PRD completo', /\[F-01\] Resta/.test(r.out) && !/\[F-02\] Multiplicación/.test(r.out));
  r = run(D, ['run', '--issue', '1', '--role', 'implementer', '--launch'], { cwd: r4, env: env4 });
  for (let i = 0; i < 50 && !(fs.existsSync(clog) && /STDIN/.test(fs.readFileSync(clog, 'utf8'))); i++) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},100)']);
  const logged = fs.existsSync(clog) ? fs.readFileSync(clog, 'utf8') : '';
  const largs = logged.split('\n')[0] ? JSON.parse(logged.split('\n')[0]) : [];
  const argOf = (k) => largs[largs.indexOf(k) + 1];
  check('dispatch: lanza claude -p con worktree del ticket, esquema de tarjeta y el rol como system prompt', r.code === 0 && largs.includes('-p') && argOf('-w') === 'feat-1-resta' && /"blind_spots"/.test(argOf('--json-schema') || '') && !/\$schema/.test(argOf('--json-schema') || '') && /Sos el implementador/.test(argOf('--append-system-prompt') || '') && /Task,Agent/.test(argOf('--disallowedTools') || ''), r.out.slice(-300));
  check('dispatch: suma las reglas del proyecto del rol (.claude/prompts) y pasa el prompt por stdin', /Usar siempre node --test/.test(argOf('--append-system-prompt') || '') && /STDIN:[1-9]/.test(logged));
  check('dispatch: el hook de worktrees va por --settings (el flag -w no usa los hooks del plugin)', (() => { try { return /worktree\.cjs\\" create/.test(fs.readFileSync(argOf('--settings'), 'utf8')); } catch { return false; } })());
  for (let i = 0; i < 50 && !/terminado/.test(run(D, ['status'], { cwd: r4, env: env4 }).out); i++) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},100)']);
  r = run(D, ['status'], { cwd: r4, env: env4 });
  check('dispatch: status lee la tarjeta validada y el costo', /terminado — tarjeta: 1\/1 criterios, pruebas pasan, sin el cambio fallan: si · US\$ 0\.12/.test(r.out), r.out);
  const runId = (r.out.match(/^(\S+-implementer-1)/m) || [])[1];
  r = run(D, ['collect', '--run', runId || 'x'], { cwd: r4, env: env4 });
  check('dispatch: collect guarda la tarjeta en .dev-flow/cards (fuera de .claude/, que Claude Code protege)', r.code === 0 && fs.existsSync(path.join(r4, '.dev-flow', 'cards', '1.json')));
  r = run(D, ['run', '--issue', '1', '--role', 'implementer', '--launch'], { cwd: r4, env: env4 });
  check('dispatch: comparte cupos con feature-flow (espera mínima y no repetir el mismo ticket)', r.code === 1 && /espera mínima|ya se lanzó/.test(r.out));
  r = run(D, ['run', '--issue', '1', '--role', 'implementer'], { cwd: r4, env: { ...env4, FEATURE_FLOW_CHILD: '1' } });
  check('dispatch: un worker no puede lanzar otros', r.code === 1 && /worker/.test(r.out));
  r = run(D, ['run', '--pr', '9', '--role', 'auditor', '--mode', 'bg'], { cwd: r4, env: env4 });
  check('dispatch: el auditor solo existe en modo headless o con un PR válido', r.code === 1);

  // --- session-guard con dispatch
  const SG = path.join(DF, 'hooks', 'session-guard.cjs');
  const g = (command, e = {}) => { const x = spawnSync(process.execPath, [SG], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8', env: { ...process.env, AI_ENV_HOME: tmp, ...e } }); return { code: x.status, out: `${x.stdout}${x.stderr}` }; };
  const DQ = 'node "C:/Users/u/.claude/plugins/cache/ai-env/dev-flow/1.1.0/skills/dispatch/scripts/dispatch.cjs"';
  check('session-guard: el dry-run de dispatch pasa sin preguntar', g(`${DQ} run --issue 12 --role implementer`).code === 0 && !/ask/.test(g(`${DQ} run --issue 12 --role implementer`).out));
  check('session-guard: dispatch --launch pide confirmación humana', /"permissionDecision":"ask"/.test(g(`${DQ} run --issue 12 --role implementer --launch`).out));
  check('session-guard: dispatch --launch encadenado con otro comando se bloquea', g(`${DQ} run --issue 12 --role implementer --launch && echo x`).code === 2);
  check('session-guard: un worker no puede usar dispatch --launch', g(`${DQ} run --pr 3 --role auditor --launch`, { FEATURE_FLOW_CHILD: '1' }).code === 2);

  // --- project-init --agents y setup --worktrees
  const r5 = repo('init');
  const I = K('project-init', 'init.cjs');
  r = run(I, ['--dir', r5, '--agents', '--apply']);
  const has = (f) => fs.existsSync(path.join(r5, f));
  check('project-init --agents: crea dev-flow.json, PRD, ESTADO, CHANGELOG, prompts por rol y .worktreeinclude', r.code === 0 && ['.claude/dev-flow.json', 'docs/PRD.md', 'docs/ESTADO.md', 'docs/CHANGELOG.md', '.claude/prompts/implementer.md', '.claude/prompts/auditor.md', '.worktreeinclude'].every(has) && !has('docs/STATE.md'));
  check('project-init --agents: CLAUDE.md describe el flujo y .gitignore excluye .dev-flow/', /<!-- agents:start -->/.test(fs.readFileSync(path.join(r5, 'CLAUDE.md'), 'utf8')) && /^\.dev-flow\/$/m.test(fs.readFileSync(path.join(r5, '.gitignore'), 'utf8')));
  check('project-init --agents: es idempotente', /nada: el repo ya tiene todo esto/.test(run(I, ['--dir', r5, '--agents']).out));
  const RH = path.join(DF, 'hooks', 'rehydrate.cjs');
  write(r5, 'docs/ESTADO.md', '# Estado\n- decisión ESTADO-XYZ\n');
  let x = spawnSync(process.execPath, [RH], { input: JSON.stringify({ source: 'compact', cwd: r5 }), encoding: 'utf8', env: { ...process.env, AI_ENV_HOME: tmp, CLAUDE_PROJECT_DIR: r5 } });
  check('rehydrate: tras compactar inyecta el archivo de estado configurado (docs/ESTADO.md)', /ESTADO-XYZ/.test(x.stdout) && /docs\/ESTADO\.md/.test(x.stdout));
  git(r5, ['commit', '-q', '--allow-empty', '-m', 'i']); git(r5, ['checkout', '-q', '-b', 'feat/7-algo']);
  x = spawnSync(process.execPath, [RH], { input: JSON.stringify({ source: 'startup', cwd: r5 }), encoding: 'utf8', env: { ...process.env, AI_ENV_HOME: tmp, CLAUDE_PROJECT_DIR: r5 } });
  check('rehydrate: en una rama de ticket recuerda el issue y cómo releerlo', /ticket #7/.test(x.stdout) && /gh issue view 7/.test(x.stdout));
  const home = path.join(tmp, 'home');
  r = run(K('setup', 'setup.cjs'), ['--apply', '--worktrees', '~/wt'], { env: { AI_ENV_HOME: home } });
  let us = {}; try { us = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')); } catch { /* */ }
  check('setup --worktrees: copia el hook fuera del plugin y lo registra en los settings del usuario', r.code === 0 && fs.existsSync(path.join(home, '.claude', 'ai-env', 'worktree', 'hooks', 'worktree.cjs')) && /worktree\.cjs\\" create/.test(JSON.stringify((us.hooks || {}).WorktreeCreate || [])) && JSON.parse(fs.readFileSync(path.join(home, '.claude', 'ai-env', 'worktrees.json'), 'utf8')).root === '~/wt');
  run(K('setup', 'setup.cjs'), ['--apply', '--worktrees', '~/wt'], { env: { AI_ENV_HOME: home } });
  us = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
  check('setup --worktrees: es idempotente (no duplica el hook)', us.hooks.WorktreeCreate.length === 1 && us.hooks.WorktreeRemove.length === 1);
  const copy = spawnSync(process.execPath, [path.join(home, '.claude', 'ai-env', 'worktree', 'hooks', 'worktree.cjs'), 'create'], { input: JSON.stringify({ cwd: r3, name: 'fix-4-copia' }), encoding: 'utf8', env: { ...process.env, AI_ENV_HOME: home } });
  check('setup --worktrees: la copia instalada funciona sola (crea en la raíz del usuario)', copy.status === 0 && copy.stdout.trim().endsWith(path.join('wt', 'wt', 'fix-4-copia')), copy.stderr);
  if (copy.status === 0) spawnSync(process.execPath, [W, 'remove-path', copy.stdout.trim()]);

  fs.rmSync(tmp, { recursive: true, force: true });
};
