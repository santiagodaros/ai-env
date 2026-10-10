// Carril rápido (quick-fix) blindado: reglas de ruta y de contenido (agregadas y eliminadas), la evasión confirmada
// rechazada, arreglos legítimos que siguen pasando (control de falsos positivos), --plan y destino. Además, las
// muestras de la statusline y el burn-rate de budget-plan.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function quickRisk({ check }) {
  const DF = path.join(__dirname, '..', 'plugins', 'dev-flow');
  const risk = require(path.join(DF, 'skills', 'quick-fix', 'scripts', 'risk.cjs'));
  const Q = path.join(DF, 'skills', 'quick-fix', 'scripts', 'quick.cjs');
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aienv-qr-')));
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
  const q = (d, args = []) => { const r = spawnSync(process.execPath, [Q, ...args, '--json'], { cwd: d, encoding: 'utf8' }); let j = {}; try { j = JSON.parse(r.stdout); } catch { /* */ } return { code: r.status, j, out: `${r.stdout}${r.stderr}` }; };
  const change = (d, edits) => { for (const [f, t] of Object.entries(edits)) w(d, f, t); git(d, ['add', '-A']); return q(d, ['--no-test', 'prueba automatizada del filtro']); };

  // --- Unidades: cada regla de contenido, por línea agregada y por línea eliminada.
  const diffOf = (sign, text) => `--- a/src/x.js\n+++ b/src/x.js\n@@ -1 +1 @@\n${sign}${text}\n`;
  const CASES = {
    auth: 'app.get("/admin", requireAuth, h);', session: 'const sessionTimeoutMin = 0;', cors: "res.setHeader('Access-Control-Allow-Origin', '*');",
    tls: 'const agent = new https.Agent({ rejectUnauthorized: false });', roles: 'if (user.roles.includes("x")) ok();', secrets: 'const password = process.env.P;',
    csrf: 'app.use(csrf());', exec: 'exec(`rm -rf ${dir}`);',
  };
  const both = Object.entries(CASES).every(([id, text]) => ['+', '-'].every((sg) => { const r = risk.contentRisks(diffOf(sg, text)); return r.length === 1 && r[0].id === id && r[0].sign === sg; }));
  check('quick-fix: cada regla de contenido dispara por línea agregada y por línea eliminada', both, JSON.stringify(Object.entries(CASES).map(([id, t]) => [id, risk.contentRisks(diffOf('-', t)).map((x) => x.id)])));
  check('quick-fix: [Authorize] y [AllowAnonymous] de .NET, @PreAuthorize de Java y login_required de Django disparan', ['[Authorize(Roles = "Admin")]', '[AllowAnonymous]', '@PreAuthorize("hasRole(\'ADMIN\')")', '@login_required'].every((t) => risk.contentRisks(diffOf('+', t)).length === 1));
  check('quick-fix: en pruebas y docs el contenido no cuenta', risk.contentRisks('--- a/test/x.test.js\n+++ b/test/x.test.js\n@@ -1 +1 @@\n-requireAuth\n', (f) => /test/.test(f)).length === 0);
  const LEGIT = ['throw new Error("división por cero");', 'const m = /(\\d+)-/.exec(s);', 'return Math.round(x * 100) / 100;', 'for (let i = 0; i < items.length; i++) {', 'const author = post.author.name;', 'const tokens = tokenizer.split(text);', '<button role="button">Guardar</button>', 'const total = rows.reduce((a, r) => a + r.amount, 0);'];
  const fp = LEGIT.filter((t) => risk.contentRisks(diffOf('+', t)).length);
  check('quick-fix: los arreglos legítimos comunes no disparan reglas (control de falsos positivos)', fp.length === 0, `disparan: ${fp.join(' | ')}`);
  const pr = (f) => risk.pathReasons([f]).some((r) => r.id === 'identity');
  check('quick-fix: identidad por palabras de la ruta, no por subcadenas', pr('src/auth/index.ts') && pr('src/authMiddleware.ts') && pr('src/OAuthClient.cs') && pr('.env.local') && pr('api/user_sessions.py') && !pr('src/author.ts') && !pr('src/tokenizer.ts') && !pr('src/roleplay-guide.md'.replace('roleplay', 'storyline')));

  // --- La evasión confirmada (antes pasaba como "chico" y "ok") y variantes.
  const base = { 'src/server.js': "const app = require('express')();\napp.get('/admin/users', requireAuth, listUsers);\nmodule.exports = { sessionTimeoutMin: 30, cors: { origin: 'https://app.ejemplo.test' } };\n" };
  let d = repo(base);
  let r = change(d, { 'src/server.js': base['src/server.js'].replace('requireAuth, ', '') });
  check('quick-fix: sacar requireAuth de una ruta (una línea eliminada) NO es un cambio chico', r.code === 3 && r.j.small === false && r.j.why.some((x) => /autenticación/.test(x) && /línea eliminada/.test(x) && /src\/server\.js:2/.test(x)), r.out.slice(0, 300));
  check('quick-fix: el rechazo indica el destino con auditoría y no partir el cambio', /feature-flow/.test(r.j.destination || '') && /No partas el cambio/.test(spawnSync(process.execPath, [Q], { cwd: d, encoding: 'utf8' }).stdout));
  d = repo(base); r = change(d, { 'src/server.js': base['src/server.js'].replace('sessionTimeoutMin: 30', 'sessionTimeoutMin: 0') });
  check('quick-fix: poner un timeout de sesión en 0 NO es un cambio chico', r.code === 3 && r.j.why.some((x) => /sesión/.test(x)));
  d = repo(base); r = change(d, { 'src/server.js': base['src/server.js'].replace("'https://app.ejemplo.test'", "'*'") });
  check('quick-fix: abrir CORS a * NO es un cambio chico', r.code === 3 && r.j.why.some((x) => /CORS/.test(x)));
  d = repo({ 'src/view.js': 'exports.render = (el, t) => { el.textContent = t; };\n' });
  r = change(d, { 'src/view.js': 'exports.render = (el, t) => { el.innerHTML = t; };\n' });
  check('quick-fix: un hallazgo de seguridad medio en código (innerHTML) saca del carril', r.code === 3 && r.j.why.some((x) => /S005/.test(x)));

  // --- Control: un arreglo legítimo con prueba pasa y queda listo para commitear.
  d = repo({ 'src/calc.js': "exports.div = (a, b) => { if (b === 0) throw new Error('divison por cero'); return a / b; };\n" });
  w(d, 'src/calc.js', "exports.div = (a, b) => { if (b === 0) throw new Error('división por cero'); return a / b; };\n");
  w(d, 'test/calc.test.js', "require('node:test')('msg', () => require('node:assert').throws(() => require('../src/calc.js').div(1, 0), /división/));\n");
  git(d, ['add', '-A']);
  r = q(d, ['--log', 'corrige el typo del mensaje de división por cero']);
  check('quick-fix: un arreglo legítimo con su prueba pasa y queda anotado en el CHANGELOG', r.code === 0 && r.j.ok && r.j.small && /arreglo: corrige el typo/.test(fs.readFileSync(path.join(d, 'docs', 'CHANGELOG.md'), 'utf8')), r.out.slice(0, 300));

  // --- --plan: chequeo previo de rutas, antes de editar.
  d = repo({ 'src/a.js': '1;\n' });
  r = spawnSync(process.execPath, [Q, '--plan', 'src/a.js,src/b.js', '--json'], { cwd: d, encoding: 'utf8' });
  check('quick-fix --plan: rutas que califican salen con 0', r.status === 0 && JSON.parse(r.stdout).ok === true);
  r = spawnSync(process.execPath, [Q, '--plan', 'src/auth/login.js', '--json'], { cwd: d, encoding: 'utf8' });
  let pj = {}; try { pj = JSON.parse(r.stdout); } catch { /* */ }
  check('quick-fix --plan: identidad no califica y un módulo nuevo va primero por arch-first', r.status === 3 && pj.ok === false && /arch-first/.test(pj.destination || ''), r.stdout.slice(0, 200));
  check('quick-fix: no existe un flag ni un comentario para saltear el piso', !/--force|--skip|quickfix-allow/.test(fs.readFileSync(Q, 'utf8') + fs.readFileSync(path.join(DF, 'skills', 'quick-fix', 'scripts', 'risk.cjs'), 'utf8').replace(/sin comentarios de excepción/, '')));

  // --- Statusline: muestras del límite de 5 h (una por minuto, máximo 60, ventana actual).
  const SL = path.join(DF, 'scripts', 'statusline.cjs');
  const bdir = path.join(tmp, 'budget');
  const reset = Math.floor(Date.now() / 1000) + 3600;
  const sl = (pct, rs = reset) => spawnSync(process.execPath, [SL], { input: JSON.stringify({ model: { display_name: 'X' }, rate_limits: { five_hour: { used_percentage: pct, resets_at: rs } } }), encoding: 'utf8', env: { ...process.env, CLAUDE_BUDGET_DIR: bdir } });
  sl(40); sl(41);
  const L1 = JSON.parse(fs.readFileSync(path.join(bdir, 'latest.json'), 'utf8'));
  check('statusline: guarda como mucho una muestra por minuto', Array.isArray(L1.samples) && L1.samples.length === 1 && L1.samples[0].pct === 40);
  const now = Date.now();
  fs.writeFileSync(path.join(bdir, 'latest.json'), JSON.stringify({ ...L1, samples: Array.from({ length: 70 }, (_, i) => ({ at: now - (70 - i) * 61000, pct: 30 + i * 0.1, resetsAt: reset })) }));
  sl(50);
  const L2 = JSON.parse(fs.readFileSync(path.join(bdir, 'latest.json'), 'utf8'));
  check('statusline: conserva las últimas 60 muestras', L2.samples.length === 60 && L2.samples[59].pct === 50);
  sl(5, reset + 18000);
  check('statusline: al reiniciarse la ventana descarta las muestras viejas', JSON.parse(fs.readFileSync(path.join(bdir, 'latest.json'), 'utf8')).samples.length === 1);

  // --- budget-plan: burn y batch.
  const BP = path.join(DF, 'skills', 'budget-plan', 'scripts', 'budget.cjs');
  const bj = (args) => { const x = spawnSync(process.execPath, [BP, ...args, '--json'], { cwd: tmp, encoding: 'utf8', env: { ...process.env, CLAUDE_BUDGET_DIR: bdir } }); let j = {}; try { j = JSON.parse(x.stdout); } catch { /* */ } return { code: x.status, j }; };
  const put = (pct, samples) => fs.writeFileSync(path.join(bdir, 'latest.json'), JSON.stringify({ at: Date.now(), fiveHour: { pct, resetsAt: reset }, samples }));
  put(60, Array.from({ length: 11 }, (_, i) => ({ at: Date.now() - (20 - 2 * i) * 60000, pct: 50 + i, resetsAt: reset })));
  let b = bj(['burn']);
  check('budget burn: calcula %/min con las muestras de los últimos 30 min', b.j.ok && b.j.ratePctPerMin === 0.5 && b.j.minutesToReserve === 60, JSON.stringify(b.j));
  put(60, [{ at: Date.now(), pct: 60, resetsAt: reset }]);
  check('budget burn: con pocas muestras no inventa una velocidad', bj(['burn']).j.ok === false);
  put(60, []);
  b = bj(['batch', '3', '--minutes', '20', '--per-worker', '12']);
  check('budget batch: con 30% usable y 12% por worker entran 2 de 3', b.code === 0 && b.j.launchable === 2 && b.j.status === 'parcial', JSON.stringify(b.j));
  put(85, Array.from({ length: 11 }, (_, i) => ({ at: Date.now() - (20 - 2 * i) * 60000, pct: 75 + i, resetsAt: reset })));
  b = bj(['batch', '1', '--minutes', '30']);
  check('budget batch: si el ritmo actual agota la reserva antes de que termine un worker, no lanza (exit 4)', b.code === 4 && b.j.launchable === 0, JSON.stringify(b.j));
  fs.rmSync(path.join(bdir, 'latest.json'), { force: true });
  b = bj(['batch', '3', '--minutes', '20']);
  check('budget batch: sin datos (API key o sin statusline) no bloquea', b.code === 0 && b.j.launchable === 3 && b.j.status === 'sin-datos');

  fs.rmSync(tmp, { recursive: true, force: true });
};
