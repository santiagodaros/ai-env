// Pruebas del arnés (olas 1-3): expediente por ticket, harness check, lead-guard, aviso asíncrono, dispatch con
// tamaño/modelo, scripts fijados, session-id, lotes en paralelo, reanudar, métricas, plan, memoria por rol, codemap,
// brief completo desde el PRD y resumen versionable en el PR. GitHub y Claude Code son falsos.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function harness({ check, add, run }) {
  const DF = path.join(__dirname, '..', 'plugins', 'dev-flow');
  const K = (skill, f) => path.join(DF, 'skills', skill, 'scripts', f);
  const H = (f) => path.join(DF, 'hooks', f);
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aienv-hz-')));
  const GHF = path.join(__dirname, 'fixtures', 'gh-fake.cjs');
  const git = (cwd, a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  const write = (d, f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
  const commit = (d, m) => { git(d, ['add', '-A']); git(d, ['commit', '-q', '-m', m]); };
  const repo = (name) => { const d = path.join(tmp, name); fs.mkdirSync(d, { recursive: true }); for (const a of [['init', '-q', '-b', 'main'], ['config', 'user.email', 't@example.com'], ['config', 'user.name', 't']]) git(d, a); return d; };
  const json = (r) => { try { return JSON.parse(r.out); } catch { return {}; } };
  const wait = (ms) => spawnSync(process.execPath, ['-e', `setTimeout(()=>{},${ms})`]);
  const hook = (file, input, env = {}) => { const x = spawnSync(process.execPath, [file], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, AI_ENV_HOME: tmp, ...env } }); return { code: x.status, out: `${x.stdout || ''}${x.stderr || ''}` }; };

  const card = { ticket: 1, branch: 'feat/1-resta', summary: 'Agrega resta(a, b) con pruebas que fallan sin el cambio.', files_changed: ['src/calc.js', 'test/calc.test.js'], commands: [{ cmd: 'npm test', exit: 0 }], tests: { command: 'npm test', passed: true, added: ['test/calc.test.js'], fail_without_change: 'si' }, acceptance: [{ criterion: 'resta(5, 2) devuelve 3', status: 'cumple', evidence: 'test/calc.test.js:4' }], decisions: [{ decision: 'resta en el mismo módulo que suma', reason: 'el PRD pide exportarla junto a suma' }], blind_spots: ['No probé entradas no numéricas.'], followups: ['Validar tipos de entrada en otro ticket.'] };
  const verdict = { pr: 2, verdict: 'cambios', summary: 'Falta un caso de error; el resto cumple F-01 con pruebas honestas.', tests_honest: 'si', findings: [{ severity: 'P1', area: 'tests', where: 'test/calc.test.js', issue: 'no hay caso con negativos', fix: 'agregar resta(2, 5) === -3' }], checks: [{ name: 'audit.cjs', result: 'pasa' }] };

  // --- Expediente por ticket
  const r1 = repo('dossier');
  git(r1, ['commit', '-q', '--allow-empty', '-m', 'i']);
  const D = K('dispatch', 'dossier.cjs');
  write(tmp, 'brief.md', '### [F-01] Resta\n\n## Criterios de aceptación\n\n- [ ] resta(5, 2) devuelve 3\n');
  let r = run(D, ['init', '1', '--title', 'F-01 Resta', '--brief-file', path.join(tmp, 'brief.md')], { cwd: r1 });
  const td = path.join(r1, '.dev-flow', 'tickets', '1');
  check('expediente: init crea brief, progress (plantilla) y log', r.code === 0 && ['brief.md', 'progress.md', 'log.md'].every((f) => fs.existsSync(path.join(td, f))));
  const run1 = path.join(r1, '.dev-flow', 'runs', 'r-impl-1');
  write(run1, 'meta.json', JSON.stringify({ id: 'r-impl-1', role: 'implementer', issue: 1, at: Date.now() - 60000 }));
  write(run1, 'out.json', JSON.stringify({ subtype: 'success', total_cost_usd: 0.3, num_turns: 9, structured_output: card }));
  fs.writeFileSync(path.join(td, 'progress.md'), fs.readFileSync(path.join(td, 'progress.md'), 'utf8').replace(/## Siguiente paso\n-[^\n]*/, '## Siguiente paso\n- Abrir el PR con la tarjeta'));
  r = run(D, ['record', '1', '--run-dir', run1], { cwd: r1 });
  check('expediente: record agrega la corrida al log y escribe el informe impl-1.md', r.code === 0 && fs.existsSync(path.join(td, 'impl-1.md')) && /implementer \(r-impl-1\)/.test(fs.readFileSync(path.join(td, 'log.md'), 'utf8')));
  run(D, ['record', '1', '--run-dir', run1], { cwd: r1 });
  check('expediente: registrar dos veces la misma corrida no la duplica', (fs.readFileSync(path.join(td, 'log.md'), 'utf8').match(/<!-- run:r-impl-1 -->/g) || []).length === 1 && !fs.existsSync(path.join(td, 'impl-2.md')));
  const run2 = path.join(r1, '.dev-flow', 'runs', 'r-aud-1');
  write(run2, 'meta.json', JSON.stringify({ id: 'r-aud-1', role: 'auditor', issue: 1, pr: 2, at: Date.now() }));
  write(run2, 'out.json', JSON.stringify({ subtype: 'success', total_cost_usd: 0.6, structured_output: verdict }));
  run(D, ['record', '1', '--run-dir', run2], { cwd: r1 });
  const idx = fs.readFileSync(path.join(td, 'index.md'), 'utf8');
  check('expediente: index.md resume estado, decisiones, archivos, hallazgos abiertos y siguiente paso', /auditado: cambios/.test(idx) && /resta en el mismo módulo/.test(idx) && /src\/calc\.js/.test(idx) && /P1 \[tests\]/.test(idx) && /Abrir el PR con la tarjeta/.test(idx) && idx.split('\n').length < 60, JSON.stringify([/auditado: cambios/.test(idx), /resta en el mismo módulo/.test(idx), /src\/calc\.js/.test(idx), /P1 \[tests\]/.test(idx), /Abrir el PR con la tarjeta/.test(idx)]));
  r = run(D, ['summary', '1'], { cwd: r1 });
  check('expediente: summary arma el resumen versionable sin borradores ni rutas locales del expediente', r.code === 0 && /Decisiones/.test(r.out) && /## Corridas/.test(r.out) && !/Archivos del expediente/.test(r.out));

  // --- harness check
  const HS = K('dispatch', 'harness.cjs');
  const r2 = repo('hz');
  write(r2, 'package.json', JSON.stringify({ name: 'x', scripts: { test: 'node --test' } }));
  write(r2, 'test/a.test.js', "require('node:test')('a', () => require('node:assert').ok(1 === 1));\n");
  write(r2, 'docs/PRD.md', '# PRD\n\n## [F-01] Uno\nArchivos: src/a.js\n\n- [ ] algo\n');
  commit(r2, 'i');
  r = run(HS, ['check', '--pre', '--json'], { cwd: r2, env: { AI_ENV_GH: JSON.stringify([process.execPath, GHF]), FAKE_GH_STATE: path.join(tmp, 'gh-h.json') } });
  check('harness --pre: repo sano (PRD válido, base en verde con pruebas locales) pasa', r.code === 0 && json(r).ok && (json(r).rows || []).some((x) => /en verde/.test(x.name) && x.res === 'OK'), r.out.slice(0, 300));
  write(r2, 'docs/PRD.md', '# PRD\n\n## [F-01] Uno\nDepende de: F-09\n');
  r = run(HS, ['check', '--pre', '--json', '--no-tests'], { cwd: r2 });
  check('harness --pre: un PRD con dependencia inexistente FALLA', r.code === 1 && /F-09/.test(r.out));
  git(r2, ['checkout', '-q', '--', 'docs/PRD.md']);
  write(r2, 'test/b.test.js', "require('node:test')('b', () => require('node:assert').ok(false));\n");
  r = run(HS, ['check', '--worker', '--json'], { cwd: r2 });
  check('harness --worker: con las pruebas ya rotas antes de empezar, FALLA (el worker no arranca)', r.code === 1 && (json(r).rows || []).some((x) => x.id === 'W2' && x.res === 'FALLA'));
  fs.rmSync(path.join(r2, 'test', 'b.test.js'));
  r = run(HS, ['check', '--end', '--json'], { cwd: r2, env: { AI_ENV_GH: JSON.stringify([process.execPath, GHF]), FAKE_GH_STATE: path.join(tmp, 'gh-h.json') } });
  check('harness --end: informa checkpoints de estado final (ESTADO, worktrees, cierre trazable)', (json(r).rows || []).some((x) => x.id === 'C4') && (json(r).rows || []).some((x) => x.id === 'C5'));

  // --- lead-guard
  const LG = H('lead-guard.cjs');
  const r3 = repo('lead');
  write(r3, '.claude/dev-flow.json', JSON.stringify({ lead: { enforce: true } })); commit(r3, 'i');
  const lg = (file, env = {}) => hook(LG, { tool_name: 'Edit', cwd: r3, tool_input: { file_path: file } }, { CLAUDE_PROJECT_DIR: r3, ...env });
  check('lead-guard: en modo Tech Lead bloquea editar código en el checkout principal', lg(path.join(r3, 'src', 'a.ts')).code === 2);
  check('lead-guard: permite docs, PRD, .claude y archivos que no son código', [path.join(r3, 'docs', 'PRD.md'), path.join(r3, 'README.md'), path.join(r3, '.claude', 'prompts', 'x.md')].every((f) => lg(f).code === 0));
  git(r3, ['worktree', 'add', '-q', '-b', 'feat/1-x', path.join(r3, '.claude', 'worktrees', 'feat-1-x')]);
  check('lead-guard: permite editar código dentro de un worktree (ahí trabajan los workers)', lg(path.join(r3, '.claude', 'worktrees', 'feat-1-x', 'src', 'a.ts')).code === 0);
  // Copia de trabajo del worker dentro del worktree (la sesión con -w no puede escribir el expediente del checkout principal)
  const wt3 = path.join(r3, '.claude', 'worktrees', 'feat-1-x');
  r = run(HS, ['check', '--worker', '--no-tests', '--json'], { cwd: wt3 });
  check('harness --worker: siembra .dev-flow/ticket/progress.md en el worktree del ticket', (json(r).rows || []).some((x) => x.id === 'W3' && x.res === 'OK') && fs.existsSync(path.join(wt3, '.dev-flow', 'ticket', 'progress.md')), r.out.slice(0, 300));
  run(D, ['init', '1', '--title', 'X'], { cwd: r3 });
  wait(20);
  fs.writeFileSync(path.join(wt3, '.dev-flow', 'ticket', 'progress.md'), '# P\n\n## Siguiente paso\n- Correr la migración en staging\n');
  r = run(D, ['index', '1', '--print'], { cwd: r3 });
  check('expediente: index trae el progress.md del worktree del ticket (pull)', /Correr la migración en staging/.test(r.out) && /Correr la migración/.test(fs.readFileSync(path.join(r3, '.dev-flow', 'tickets', '1', 'progress.md'), 'utf8')), r.out.slice(0, 300));
  check('lead-guard: no aplica a los workers ni si el repo no activa el modo', lg(path.join(r3, 'src', 'a.ts'), { FEATURE_FLOW_CHILD: '1' }).code === 0 && hook(LG, { tool_name: 'Edit', cwd: r1, tool_input: { file_path: path.join(r1, 'src', 'a.ts') } }, { CLAUDE_PROJECT_DIR: r1 }).code === 0);

  // --- Aviso asíncrono
  const LN = H('lead-notify.cjs');
  const runV = path.join(r1, '.dev-flow', 'runs', 'r-impl-vivo');
  write(runV, 'meta.json', JSON.stringify({ id: 'r-impl-vivo', role: 'implementer', mode: 'headless', issue: 3, pid: process.pid, at: Date.now() }));
  write(runV, 'card.json', JSON.stringify(card));
  r = hook(LN, { cwd: r1, prompt: 'hola' }, { CLAUDE_PROJECT_DIR: r1 });
  check('lead-notify: avisa en una línea cada worker que terminó (con veredicto o tarjeta y cómo recogerlo)', r.code === 0 && /implementer #1 \(r-impl-1\): tarjeta lista/.test(r.out) && /auditor PR #2 \(r-aud-1\): veredicto CAMBIOS/.test(r.out) && /dispatch collect --run/.test(r.out), r.out);
  check('lead-notify: un headless vivo que ya guardó la tarjeta todavía no se avisa (sigue corriendo)', !/r-impl-vivo/.test(r.out));
  const st1 = json(run(K('dispatch', 'dispatch.cjs'), ['status', '--json'], { cwd: r1 }));
  const vivo = Array.isArray(st1) ? st1.find((x) => x.id === 'r-impl-vivo') : null;
  check('dispatch status: ese headless sigue "corriendo" hasta que escribe out.json', vivo && vivo.state === 'corriendo', JSON.stringify(vivo && vivo.state));
  check('lead-notify: no repite el aviso en el mensaje siguiente', hook(LN, { cwd: r1, prompt: 'otra' }, { CLAUDE_PROJECT_DIR: r1 }).out.trim() === '');

  // --- PRD con brief completo y tickets
  const r4 = repo('disp');
  write(r4, 'package.json', JSON.stringify({ name: 'x', scripts: { test: 'node --test' } }));
  write(r4, 'src/calc.js', "exports.suma = (a, b) => a + b;\n");
  write(r4, 'src/fmt.js', "const { suma } = require('./calc.js');\nexports.fmt = (x) => String(x);\n");
  write(r4, 'test/calc.test.js', "const t = require('node:test'); t('suma', () => require('node:assert').strictEqual(require('../src/calc.js').suma(1, 2), 3));\n");
  write(r4, 'docs/PRD.md', '# PRD\n\n## [G-01] Stack\n- Node.\n\n## [F-01] Resta\nArchivos: src/calc.js, test/calc.test.js\nTamaño: S\nFuera de alcance: multiplicación\n\n- [ ] resta(5, 2) devuelve 3\n\n## [F-02] Formato\nArchivos: src/fmt.js\nDepende de: F-01\n\n- [ ] fmt(3) devuelve "3"\n\n## [F-03] Otra cosa en calc\nArchivos: src/calc.js\n\n- [ ] algo\n');
  write(r4, '.claude/dev-flow.json', JSON.stringify({ launch: { maxConcurrent: 4, maxPerDay: 20, cooldownMinutes: 2 } }));
  write(r4, '.gitignore', '.dev-flow/\n.claude/worktrees/\n');
  commit(r4, 'i');
  const P = K('prd', 'prd.cjs');
  r = run(P, ['slice', 'F-02', '--json'], { cwd: r4 });
  check('prd: lee Archivos, Depende de, Tamaño y Fuera de alcance de cada sección', JSON.stringify(json(r).files) === '["src/fmt.js"]' && JSON.stringify(json(r).deps) === '["F-01"]' && JSON.stringify(json(run(P, ['slice', 'F-01', '--json'], { cwd: r4 })).size) === '"S"');
  const gh4 = path.join(tmp, 'gh4.json');
  const fakeClaude = path.join(tmp, 'claude-falso.cjs');
  fs.writeFileSync(fakeClaude, `const fs=require('fs');const a=process.argv.slice(2);
if(a[0]==='agents'){console.log('[]');process.exit(0);}
fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(a)+'\\n');
try{fs.readFileSync(0,'utf8')}catch{}
const c=JSON.parse(process.env.FAKE_CARD); c.ticket=Number(process.env.DEV_FLOW_TICKET||1);
console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,total_cost_usd:0.2,num_turns:5,duration_ms:1000,permission_denials:[{tool_name:'Bash',tool_input:{command:'make test'}}],structured_output:c}));`);
  const clog = path.join(tmp, 'claude.log');
  const env4 = { AI_ENV_GH: JSON.stringify([process.execPath, GHF]), FAKE_GH_STATE: gh4, AI_ENV_CLAUDE: JSON.stringify([process.execPath, fakeClaude]), FAKE_CLAUDE_LOG: clog, FAKE_CARD: JSON.stringify(card), AI_ENV_HOME: tmp, CLAUDE_BUDGET_DIR: path.join(tmp, 'sin-budget') };
  const T = K('ticket', 'ticket.cjs');
  for (const id of ['F-01', 'F-02', 'F-03']) run(T, ['create', id], { cwd: r4, env: env4 });
  const ghs = () => JSON.parse(fs.readFileSync(gh4, 'utf8'));
  const i1 = ghs().issues[0], i2 = ghs().issues[1];
  check('ticket: el issue trae Alcance, Fuera de alcance, Tamaño y la etiqueta de tamaño', /## Alcance[\s\S]*`src\/calc\.js`/.test(i1.body) && /## Fuera de alcance\n\n- multiplicación/.test(i1.body) && i1.labels.includes('tamaño:S'));
  check('ticket: las dependencias del PRD se traducen al issue que las implementa', /## Dependencias\n\n- #1 \(F-01\)/.test(i2.body));
  const DS = K('dispatch', 'dispatch.cjs');
  r = run(DS, ['run', '--issue', '2', '--role', 'implementer'], { cwd: r4, env: env4 });
  check('dispatch: no lanza un ticket cuya dependencia sigue abierta', r.code === 1 && /depende de #1/.test(r.out));
  r = run(DS, ['run', '--issues', '1,3', '--role', 'implementer'], { cwd: r4, env: env4 });
  check('dispatch: un lote con tickets que tocan los mismos archivos se rechaza (van en serie)', r.code === 1 && /mismos archivos/.test(r.out));

  // Codemap: el brief del worker incluye solo el pedazo del mapa de su alcance.
  r = run(K('dispatch', 'codemap.cjs'), [], { cwd: r4 });
  const cm = fs.existsSync(path.join(r4, 'docs', 'codemap.md')) ? fs.readFileSync(path.join(r4, 'docs', 'codemap.md'), 'utf8') : '';
  check('codemap: genera docs/codemap.md con exports y dependencias locales', r.code === 0 && /`src\/calc\.js` — .*exporta suma/.test(cm) && /`src\/fmt\.js` — .*usa src\/calc\.js/.test(cm));
  fs.writeFileSync(path.join(r4, 'docs', 'codemap.md'), cm.replace(/(- `src\/calc\.js`[^\n]*\n)/, '$1  > nota: operaciones aritméticas básicas\n'));
  run(K('dispatch', 'codemap.cjs'), [], { cwd: r4 });
  check('codemap: regenerar conserva las notas de propósito', /> nota: operaciones aritméticas básicas/.test(fs.readFileSync(path.join(r4, 'docs', 'codemap.md'), 'utf8')));
  r = run(K('dispatch', 'codemap.cjs'), ['--slice', 'src/fmt.js'], { cwd: r4 });
  check('codemap: --slice devuelve el alcance y sus dependencias directas, no el repo entero', /src\/fmt\.js/.test(r.out) && /src\/calc\.js/.test(r.out) && !/test\/calc\.test\.js/.test(r.out));
  commit(r4, 'codemap');

  // Memoria por rol (aprobada): se suma al system prompt del rol.
  r = run(DS, ['memory', 'add', '--role', 'implementer', 'Las pruebas van con node --test y sin dependencias externas.'], { cwd: r4, env: env4 });
  check('memoria: memory add guarda una lección aprobada para el rol', r.code === 0 && /node --test/.test(fs.readFileSync(path.join(r4, '.dev-flow', 'memory', 'implementer.md'), 'utf8')));
  check('memoria: rechaza lecciones vacías o de un rol inexistente', run(DS, ['memory', 'add', '--role', 'implementer', 'corta'], { cwd: r4, env: env4 }).code === 1 && run(DS, ['memory', 'add', '--role', 'jefe', 'una lección suficientemente larga'], { cwd: r4, env: env4 }).code === 1);

  // Lanzamiento con tamaño, modelo, esfuerzo, scripts fijados, session-id y expediente.
  r = run(DS, ['run', '--issue', '1', '--role', 'implementer', '--launch'], { cwd: r4, env: env4 });
  for (let i = 0; i < 50 && !(fs.existsSync(clog) && fs.readFileSync(clog, 'utf8').trim()); i++) wait(100);
  const la = (fs.existsSync(clog) ? fs.readFileSync(clog, 'utf8').trim().split('\n') : []).map((l) => JSON.parse(l));
  const a1 = la[0] || [];
  const arg = (k) => a1[a1.indexOf(k) + 1];
  check('dispatch: tamaño S → modelo sonnet, 30 turnos y esfuerzo medio', r.code === 0 && arg('--model') === 'sonnet' && arg('--max-turns') === '30' && arg('--effort') === 'medium', r.out.slice(-300));
  check('dispatch: cada corrida lleva --session-id (para reanudarla) y la memoria del rol en el system prompt', /^[0-9a-f-]{36}$/.test(arg('--session-id') || '') && /node --test y sin dependencias/.test(arg('--append-system-prompt') || ''));
  const runId = (r.out.match(/corrida (\S+)/) || [])[1];
  const rd = path.join(r4, '.dev-flow', 'runs', runId || 'x');
  const promptTxt = fs.existsSync(path.join(rd, 'prompt.md')) ? fs.readFileSync(path.join(rd, 'prompt.md'), 'utf8') : '';
  check('dispatch: los scripts del prompt apuntan a la copia fijada de la corrida, que existe', /[\\/]tools[\\/]skills[\\/]dispatch[\\/]scripts[\\/]harness\.cjs" check --worker/.test(promptTxt) && fs.existsSync(path.join(rd, 'tools', 'skills', 'dispatch', 'scripts', 'card.cjs')) && fs.existsSync(path.join(rd, 'tools', 'skills', 'dispatch', 'schemas', 'card.schema.json')));
  check('dispatch: el prompt pide progress.md y la tarjeta dentro del worktree, trae las reglas del aislamiento y el mapa del alcance', /\.dev-flow\/ticket\/progress\.md/.test(promptTxt) && /\.dev-flow\/ticket\/card\.json/.test(promptTxt) && /Un comando por llamada a Bash/.test(promptTxt) && !/runs[\\/][^\s]*card\.json/.test(promptTxt) && /Mapa del código de tu alcance/.test(promptTxt) && /operaciones aritméticas básicas/.test(promptTxt) && fs.existsSync(path.join(r4, '.dev-flow', 'tickets', '1', 'progress.md')));
  for (let i = 0; i < 50 && !/terminado/.test(run(DS, ['status'], { cwd: r4, env: env4 }).out); i++) wait(100);
  r = run(DS, ['collect', '--run', runId || 'x'], { cwd: r4, env: env4 });
  check('dispatch collect: devuelve una línea y rutas (no la tarjeta entera) y registra en el expediente', r.code === 0 && r.out.trim().split('\n').length <= 3 && !/## Tarjeta de entrega/.test(r.out) && /expediente: .*impl-1\.md/.test(r.out) && fs.existsSync(path.join(r4, '.dev-flow', 'tickets', '1', 'index.md')), r.out);
  check('dispatch collect --show: muestra la tarjeta completa solo si se pide', /## Tarjeta de entrega/.test(run(DS, ['collect', '--run', runId || 'x', '--show'], { cwd: r4, env: env4 }).out));

  // Reanudar: la misma sesión, en el mismo worktree, desde progress.md.
  const wtPath = require(H('worktree.cjs')).plan(r4, 'feat-1-resta').dest;
  git(r4, ['worktree', 'add', '-q', '-b', 'feat/1-resta', wtPath]);
  const meta = JSON.parse(fs.readFileSync(path.join(rd, 'meta.json'), 'utf8'));
  fs.writeFileSync(path.join(rd, 'out.json'), JSON.stringify({ subtype: 'error_max_turns', is_error: true, num_turns: 30, total_cost_usd: 0.4 }));
  fs.rmSync(path.join(rd, 'card.json'), { force: true });
  r = run(DS, ['status'], { cwd: r4, env: env4 });
  check('dispatch status: una corrida que se quedó sin turnos se marca reanudable', /error \(error_max_turns\)/.test(r.out) && /resume --run/.test(r.out), r.out);
  const reg = path.join(r4, '.claude', '.feature-flow', 'launches.json');
  fs.writeFileSync(reg, JSON.stringify(JSON.parse(fs.readFileSync(reg, 'utf8')).map((x) => ({ ...x, at: x.at - 10 * 60000 }))));
  r = run(DS, ['resume', '--run', runId, '--max-turns', '20', '--launch'], { cwd: r4, env: env4 });
  for (let i = 0; i < 50 && fs.readFileSync(clog, 'utf8').trim().split('\n').length < 2; i++) wait(100);
  const ra = JSON.parse(fs.readFileSync(clog, 'utf8').trim().split('\n').pop());
  check('dispatch resume: retoma la misma sesión (-r) en el worktree, con el esquema y sin crear otro worktree', r.code === 0 && ra.includes('-r') && ra[ra.indexOf('-r') + 1] === meta.session && !ra.includes('-w') && ra.includes('--json-schema'), r.out.slice(-300));

  // Lote paralelo de tickets independientes.
  for (const f of [path.join(r4, '.claude', '.feature-flow', 'launches.json')]) fs.writeFileSync(f, JSON.stringify(JSON.parse(fs.readFileSync(f, 'utf8')).map((x) => ({ ...x, at: x.at - 30 * 60000 }))));
  const gs = ghs(); gs.issues[0].state = 'CLOSED'; fs.writeFileSync(gh4, JSON.stringify(gs));
  const before = fs.readFileSync(clog, 'utf8').trim().split('\n').length;
  r = run(DS, ['run', '--issues', '2,3', '--role', 'implementer', '--launch'], { cwd: r4, env: env4 });
  for (let i = 0; i < 50 && fs.readFileSync(clog, 'utf8').trim().split('\n').length < before + 2; i++) wait(100);
  check('dispatch: un lote de tickets independientes se lanza en paralelo con una sola confirmación', r.code === 0 && /2 workers en paralelo/.test(r.out) && fs.readFileSync(clog, 'utf8').trim().split('\n').length === before + 2, r.out.slice(-300));

  // Métricas y propuestas de memoria.
  for (let i = 0; i < 50 && (run(DS, ['status'], { cwd: r4, env: env4 }).out.match(/terminado/g) || []).length < 3; i++) wait(100);
  r = run(DS, ['stats', '--json'], { cwd: r4, env: env4 });
  const st = json(r);
  check('dispatch stats: agrega corridas por rol con costo, turnos y permisos denegados (sin contenido)', st.runs >= 3 && (st.roles || []).some((x) => x.role === 'implementer') && (st.denials || []).some(([d]) => d === 'Bash(make)'), r.out.slice(0, 300));
  fs.mkdirSync(path.join(r4, '.dev-flow', 'verdicts'), { recursive: true });
  for (const n of [5, 6]) fs.writeFileSync(path.join(r4, '.dev-flow', 'verdicts', `${n}.json`), JSON.stringify({ ...verdict, pr: n, findings: [{ severity: 'P1', area: 'timeout', where: `src/c${n}.js:3`, issue: 'fetch sin timeout', fix: 'AbortSignal.timeout' }] }));
  r = run(DS, ['memory', 'propose'], { cwd: r4, env: env4 });
  const prop = fs.existsSync(path.join(r4, '.dev-flow', 'memory', 'proposals.md')) ? fs.readFileSync(path.join(r4, '.dev-flow', 'memory', 'proposals.md'), 'utf8') : '';
  check('memoria: propose sugiere lecciones de hallazgos repetidos y permisos denegados, sin aplicarlas', r.code === 0 && /\[timeout\] apareció 2 veces/.test(prop) && /Bash\(make\) denegado/.test(prop) && !/timeout/.test(fs.readFileSync(path.join(r4, '.dev-flow', 'memory', 'implementer.md'), 'utf8')));

  // Plan persistido y reinyectado.
  r = run(DS, ['plan', 'set', '1 | 2,3', '--goal', 'calculadora'], { cwd: r4, env: env4 });
  check('plan: plan set guarda las oleadas y plan show muestra el estado de cada ticket', r.code === 0 && /ola 1: #1 [^\n]*\n?[\s\S]*ola 2: #2/.test(run(DS, ['plan', 'show'], { cwd: r4, env: env4 }).out));
  const x = spawnSync(process.execPath, [H('rehydrate.cjs')], { input: JSON.stringify({ source: 'compact', cwd: r4 }), encoding: 'utf8', env: { ...process.env, AI_ENV_HOME: tmp, CLAUDE_PROJECT_DIR: r4 } });
  check('rehydrate: tras compactar, la sesión del Tech Lead recibe su plan de oleadas', /Plan del Tech Lead/.test(x.stdout) && /ola 2/.test(x.stdout));
  const xw = spawnSync(process.execPath, [H('rehydrate.cjs')], { input: JSON.stringify({ source: 'startup', cwd: wtPath }), encoding: 'utf8', env: { ...process.env, AI_ENV_HOME: tmp, CLAUDE_PROJECT_DIR: wtPath } });
  check('rehydrate: en el worktree del ticket inyecta el índice del expediente (no el plan)', /Expediente del ticket/.test(xw.stdout) && /Resta/.test(xw.stdout) && !/Plan del Tech Lead/.test(xw.stdout));

  // PR con resumen versionable del expediente.
  write(wtPath, 'src/calc.js', "exports.suma = (a, b) => a + b;\nexports.resta = (a, b) => a - b;\n"); commit(wtPath, 'resta');
  const cf = path.join(r4, '.dev-flow', 'cards', '1.json');
  r = run(T, ['pr', '1', '--card', cf], { cwd: wtPath, env: { ...env4, FAKE_GH_BRANCH: 'feat/1-resta' } });
  check('ticket pr: commitea docs/tickets/<N>.md (resumen del expediente) y lo cita en el PR', r.code === 0 && fs.existsSync(path.join(wtPath, 'docs', 'tickets', '1.md')) && /docs\(#1\): resumen del ticket/.test(git(wtPath, ['log', '--oneline', '-1']).stdout) && /docs\/tickets\/1\.md/.test(ghs().prs.slice(-1)[0].body), r.out);

  // session-guard: lote con coma.
  const SG = H('session-guard.cjs');
  check('session-guard: dispatch con --issues 12,13 --launch pide confirmación (una sola)', /"permissionDecision":"ask"/.test(hook(SG, { tool_name: 'Bash', tool_input: { command: `node "${DS}" run --issues 12,13 --role implementer --launch` } }).out));

  fs.rmSync(tmp, { recursive: true, force: true });
  void add;
};
