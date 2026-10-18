// dev-flow 2.6: ciclo de sesión. init deja en CLAUDE.md la forma de trabajo (arranque, terminado, alcance, cierre),
// docs/STATE.md trae "Siguiente paso" y "Bloqueos" y rehydrate los muestra primero, y stop-verify frena restos de depuración.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function session({ check }) {
  const DF = path.join(__dirname, '..', 'plugins', 'dev-flow');
  const I = path.join(DF, 'skills', 'init', 'scripts', 'init.cjs');
  const RH = path.join(DF, 'hooks', 'rehydrate.cjs');
  const SV = path.join(DF, 'hooks', 'stop-verify.cjs');
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aienv-ss-')));
  const git = (cwd, a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  const w = (d, f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
  let n = 0;
  const repo = (files) => {
    const d = path.join(tmp, `r${n++}`); fs.mkdirSync(d);
    for (const a of [['init', '-q'], ['config', 'user.email', 't@example.com'], ['config', 'user.name', 't']]) git(d, a);
    for (const [f, t] of Object.entries(files)) w(d, f, t);
    git(d, ['add', '-A']); git(d, ['commit', '-q', '-m', 'base']);
    return d;
  };
  const env = { ...process.env, AI_ENV_HOME: path.join(tmp, 'home') };
  const J = (d, args) => { const r = spawnSync(process.execPath, [I, ...args], { cwd: d, encoding: 'utf8', env }); let j = {}; try { j = JSON.parse(r.stdout); } catch { /* */ } return { code: r.status, j, out: `${r.stdout}${r.stderr}` }; };
  const planF = path.join(tmp, 'plan.json');
  const apply = (d, approved) => { fs.writeFileSync(planF, JSON.stringify({ v: 1, approved, answers: { mode: 'features' } })); const p = J(d, ['preview', '--plan', planF]); return J(d, ['apply', '--plan', planF, '--expect', p.j.stamp]); };
  const pkg = JSON.stringify({ name: 'x', scripts: { test: 'node --test', lint: 'node -e 0', typecheck: 'node -e 0' } });

  // --- init: forma de trabajo en CLAUDE.md
  let d = repo({ 'package.json': pkg, 'src/a.js': 'exports.a = 1;\n' });
  apply(d, ['claude-md', 'state']);
  const cm = fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8');
  check('init: CLAUDE.md trae la forma de trabajo antes que los comandos', cm.indexOf('<!-- harness:start -->') >= 0 && cm.indexOf('<!-- harness:start -->') < cm.indexOf('<!-- commands:start -->'));
  check('init: la forma de trabajo nombra el STATE, la verificación real y qué es terminado', /leé `docs\/STATE\.md`/.test(cm) && /`npm run typecheck && npm run lint && npm run test`/.test(cm) && /\*\*Terminado\*\* = la verificación da 0/.test(cm) && /`debugger`/.test(cm));
  check('init: el bloque es corto (lo carga cada sesión)', cm.slice(cm.indexOf('<!-- harness:start -->'), cm.indexOf('<!-- harness:end -->')).split('\n').length <= 12);
  check('init: no genera AGENTS.md (solo Claude)', !fs.existsSync(path.join(d, 'AGENTS.md')));
  const st = fs.readFileSync(path.join(d, 'docs', 'STATE.md'), 'utf8');
  check('init: docs/STATE.md arranca con "Siguiente paso" y "Bloqueos"', st.indexOf('## Siguiente paso') > 0 && st.indexOf('## Bloqueos') > st.indexOf('## Siguiente paso') && st.indexOf('## Bloqueos') < st.indexOf('## Decisiones'));
  check('init: con los dos bloques, una segunda corrida no tiene nada para hacer en CLAUDE.md', J(d, ['preview', '--plan', planF]).j.steps.find((s) => s.id === 'claude-md').status === 'nothing');
  check('init: verify marca OK la forma de trabajo', (J(d, ['verify']).j.checks || []).some((c) => c.res === 'OK' && /forma de trabajo/.test(c.name)));

  // Un CLAUDE.md de una versión anterior (solo comandos) se completa sin tocar lo que había.
  d = repo({ 'package.json': pkg, 'CLAUDE.md': '# x\nTexto propio.\n\n<!-- commands:start -->\n## Comandos\n- test: `npm run test`\n<!-- commands:end -->\n' });
  const before = fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8');
  fs.writeFileSync(planF, JSON.stringify({ v: 1, approved: ['claude-md'], answers: { mode: 'features' } }));
  const pv = J(d, ['preview', '--plan', planF]).j.steps.find((s) => s.id === 'claude-md');
  apply(d, ['claude-md']);
  const after = fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8');
  check('init: a un CLAUDE.md con solo comandos le agrega la forma de trabajo al final, sin duplicar comandos', pv.status === 'would-do' && after.startsWith(before) && after.split('<!-- commands:start -->').length === 2 && after.includes('<!-- harness:start -->'), JSON.stringify(pv));

  // --- Repo inicializado con una versión anterior: doctor lo marca e init lo completa (dev-flow 2.8)
  const DR = path.join(DF, 'skills', 'doctor', 'scripts', 'doctor.cjs');
  const doctor = (dd) => { const r = spawnSync(process.execPath, [DR, '--json'], { cwd: dd, encoding: 'utf8', env: { ...env, CLAUDE_PROJECT_DIR: dd } }); try { return JSON.parse(r.stdout); } catch { return []; } };
  d = repo({ 'package.json': pkg, 'CLAUDE.md': '# x\n\n<!-- commands:start -->\n## Comandos\n- test: `npm run test`\n<!-- commands:end -->\n', 'docs/STATE.md': '# STATE\n\n## Decisiones\n- usar SQLite\n\n## Hecho\n- lista\n' });
  let row = doctor(d).find((x) => /versión anterior/.test(x.name));
  check('doctor: un repo inicializado con una versión anterior se marca, con qué falta y /dev-flow:init', row && row.res === 'AVISO' && /forma de trabajo/.test(row.detail) && /"Siguiente paso" ni "Bloqueos"/.test(row.detail) && /\/dev-flow:init/.test(row.detail), JSON.stringify(row));
  const stBefore = fs.readFileSync(path.join(d, 'docs', 'STATE.md'), 'utf8');
  fs.writeFileSync(planF, JSON.stringify({ v: 1, approved: ['claude-md', 'state'], answers: { mode: 'features' } }));
  const stp = J(d, ['preview', '--plan', planF]).j.steps.find((s) => s.id === 'state');
  check('init: a un STATE sin "Siguiente paso" ni "Bloqueos" le ofrece agregarlos', stp && stp.status === 'would-do' && /Siguiente paso/.test(JSON.stringify(stp)), JSON.stringify(stp));
  apply(d, ['claude-md', 'state']);
  const stAfter = fs.readFileSync(path.join(d, 'docs', 'STATE.md'), 'utf8');
  check('init: los agrega al final sin tocar lo que había, y doctor queda al día', stAfter.startsWith(stBefore) && /^## Siguiente paso$/m.test(stAfter) && /^## Bloqueos$/m.test(stAfter) && !doctor(d).some((x) => /versión anterior/.test(x.name)) && doctor(d).some((x) => x.name === 'inicialización al día' && x.res === 'OK'));
  check('init: una segunda corrida no vuelve a agregar las secciones', J(d, ['preview', '--plan', planF]).j.steps.find((s) => s.id === 'state').status === 'nothing');

  // --- rehydrate: siguiente paso y bloqueos primero
  d = repo({ 'docs/STATE.md': '# STATE\n\n## Siguiente paso\n- Terminar el export a CSV\n\n## Bloqueos\n- Falta la credencial de prueba\n\n## Decisiones\n- \n\n## Hecho\n- Lista de gastos\n' });
  const hook = (src) => spawnSync(process.execPath, [RH], { input: JSON.stringify({ source: src, cwd: d }), encoding: 'utf8', env: { ...env, CLAUDE_PROJECT_DIR: d } }).stdout;
  const s1 = hook('startup');
  check('rehydrate: al arrancar muestra solo el siguiente paso y los bloqueos (no el STATE entero)', /Siguiente paso:\n- Terminar el export a CSV/.test(s1) && /Bloqueos:\n- Falta la credencial/.test(s1) && !/Lista de gastos/.test(s1), s1);
  const s2 = hook('compact');
  check('rehydrate: tras /compact el siguiente paso va antes que el STATE completo', s2.indexOf('Siguiente paso:') > 0 && s2.indexOf('Siguiente paso:') < s2.indexOf('# STATE') && /Lista de gastos/.test(s2));
  w(d, 'docs/STATE.md', '# STATE\n\n## Siguiente paso\n- \n\n## Bloqueos\n- \n');
  check('rehydrate: con las secciones vacías no inyecta nada al arrancar', hook('startup').trim() === '');

  // --- stop-verify: restos de depuración
  d = repo({ 'src/a.js': 'exports.a = 1;\n', 'test/a.test.js': '// pruebas\n' });
  const sv = () => spawnSync(process.execPath, [SV], { input: JSON.stringify({ cwd: d }), encoding: 'utf8', env: { ...env, CLAUDE_PROJECT_DIR: d } });
  w(d, 'src/a.js', 'exports.a = 1;\nfunction f() {\n  debugger;\n  return 2;\n}\n');
  w(d, 'test/b.test.js', "describe.only('x', () => {});\n");
  let r = sv();
  check('stop-verify: frena un debugger agregado y un .only en un archivo nuevo, con archivo:línea (exit 2)', r.status === 2 && /src\/a\.js:3: debugger/.test(r.stderr) && /test\/b\.test\.js:1: \.only\(/.test(r.stderr), r.stderr);
  w(d, 'src/a.js', 'exports.a = 1;\nconst fixture = "it.only(\'x\')";\nconst s = "debugger;";\n');
  fs.rmSync(path.join(d, 'test', 'b.test.js'));
  r = sv();
  check('stop-verify: dentro de un string no cuenta (fixtures de pruebas)', r.status === 0, r.stderr);
  w(d, 'src/a.js', 'exports.a = 1;\ndebugger; // stop-verify-allow\n');
  check('stop-verify: "stop-verify-allow" excluye la línea', sv().status === 0);
  w(d, 'src/a.js', 'exports.a = 1;\nexports.b = 2;\n');
  check('stop-verify: sin restos de depuración ni package.json no frena', sv().status === 0);

  // --- dispatch next: la máquina de estados por ticket, con corridas sintéticas
  const { nextOf } = require(path.join(DF, 'skills', 'dispatch', 'scripts', 'dispatch.cjs'));
  const root = path.join(tmp, 'tl'); fs.mkdirSync(path.join(root, '.dev-flow', 'cards'), { recursive: true }); fs.mkdirSync(path.join(root, '.dev-flow', 'verdicts'), { recursive: true });
  const t0 = Date.now() - 3600000;
  const ctx = (runs, prs = [], waves = [[1], [2]]) => { const c = { all: runs, prs, queued: [], waveDeps: (n) => { const k = waves.findIndex((w) => w.includes(n)); return k > 0 ? waves.slice(0, k).flat() : []; } }; c.done = (n) => !!nextOf(root, n, c).done; return c; };
  const impl = (o) => ({ id: 'r-i', issue: 1, role: 'implementer', at: t0, state: 'terminado', result: { verdict: undefined }, worktree: 'feat-1-x', ...o });
  const nx = (runs, prs, n = 1, waves) => nextOf(root, n, ctx(runs, prs, waves));
  check('dispatch next: sin corridas, lanzar el implementer (con el aviso del dry-run)', /run --issue 1 --role implementer/.test(nx([], []).cmd) && nx([], []).state === 'sin lanzar');
  check('dispatch next: la oleada siguiente espera a la anterior', nx([], [], 2).state === 'espera a #1');
  check('dispatch next: worker corriendo → esperar', nx([impl({ state: 'corriendo', result: null })], []).wait === true);
  check('dispatch next: cortado sin tarjeta → reanudar', /resume --run r-i/.test(nx([impl({ state: 'error (max_turns)', result: null })], []).cmd));
  check('dispatch next: tarjeta sin recoger → collect', /collect --run r-i/.test(nx([impl({})], []).cmd));
  fs.writeFileSync(path.join(root, '.dev-flow', 'cards', '1.json'), '{}');
  check('dispatch next: recogida y sin PR → ticket pr', /ticket\.cjs" pr 1 --card/.test(nx([impl({})], []).cmd));
  const pr = { number: 7, headRefName: 'feat/1-x', body: 'Closes #1', state: 'OPEN' };
  check('dispatch next: PR abierto sin auditar → auditor', /run --pr 7 --role auditor/.test(nx([impl({})], [pr]).cmd));
  const aud = (o) => ({ id: 'r-a', issue: 1, pr: 7, role: 'auditor', at: t0 + 1000, state: 'terminado', result: { verdict: 'aprobar' }, ...o });
  check('dispatch next: veredicto sin recoger → collect del auditor', /collect --run r-a/.test(nx([impl({}), aud({})], [pr]).cmd));
  fs.writeFileSync(path.join(root, '.dev-flow', 'verdicts', '7.json'), '{}');
  check('dispatch next: aprobado → el merge lo decide la persona (parada humana)', nx([impl({}), aud({})], [pr]).human === true && /lo decidís vos/.test(nx([impl({}), aud({})], [pr]).cmd));
  check('dispatch next: cambios → nuevo implementer sobre el mismo ticket', /run --issue 1 --role implementer/.test(nx([impl({}), aud({ result: { verdict: 'cambios' } })], [pr]).cmd));
  check('dispatch next: bloquear → discutir antes de seguir', nx([impl({}), aud({ result: { verdict: 'bloquear' } })], [pr]).human === true);
  check('dispatch next: PR mergeado → terminado, y la oleada siguiente se libera', nx([impl({})], [{ ...pr, state: 'MERGED' }]).done === true && /run --issue 2/.test(nx([impl({})], [{ ...pr, state: 'MERGED' }], 2).cmd || ''));

  fs.rmSync(tmp, { recursive: true, force: true });
};
