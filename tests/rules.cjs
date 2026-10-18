// dev-flow 2.8: un hallazgo de juicio que se repite en 3 PRs pasa a regla determinista con su prueba.
// memory propose la sugiere con las líneas citadas, rule-check corre su prueba, rule-add la aprueba y audit.cjs la aplica.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function rules({ check }) {
  const DF = path.join(__dirname, '..', 'plugins', 'dev-flow');
  const DS = path.join(DF, 'skills', 'dispatch', 'scripts', 'dispatch.cjs');
  const AU = path.join(DF, 'skills', 'audit', 'scripts', 'audit.cjs');
  const R = require(path.join(DF, 'skills', 'audit', 'scripts', 'rules.cjs'));
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aienv-ru-')));
  const git = (a) => spawnSync('git', a, { cwd: tmp, encoding: 'utf8' });
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), t); };
  const env = { ...process.env, AI_ENV_HOME: path.join(tmp, 'home') };
  const run = (s, a) => { const r = spawnSync(process.execPath, [s, ...a], { cwd: tmp, encoding: 'utf8', env }); return { code: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout }; };
  for (const a of [['init', '-q', '-b', 'main'], ['config', 'user.email', 't@example.com'], ['config', 'user.name', 't']]) git(a);
  w('.gitignore', '.dev-flow/\n');
  w('src/pagos.ts', "export const pagar = (b) => retry(() => api.post('/pagos', b));\n");
  w('src/envios.ts', "const r = await retry(() => api.post('/envios', body));\n");
  w('src/reservas.ts', "await withRetry(() => http.post(url, data));\n");
  git(['add', '-A']); git(['commit', '-q', '-m', 'base']);

  // Tres veredictos de PRs distintos con el mismo hallazgo de juicio (sin id de chequeo) y uno de chequeo (S001).
  const v = (pr, where) => w(`.dev-flow/verdicts/${pr}.json`, JSON.stringify({ verdict: 'cambios', findings: [{ severity: 'P1', area: 'Resiliencia', where, issue: 'POST reintentado sin clave de idempotencia', fix: 'Idempotency-Key y deduplicar en el servidor' }, { id: 'fetch-sin-timeout', severity: 'P1', area: 'timeout', where: 'src/x.ts:1', issue: 'fetch sin timeout', fix: 'x' }] }));
  v(11, 'src/pagos.ts:1'); v(12, 'src/envios.ts:1');
  let r = run(DS, ['memory', 'propose']);
  check('reglas: con el hallazgo en 2 PRs todavía no propone regla', r.code === 0 && !fs.existsSync(path.join(tmp, '.dev-flow', 'memory', 'rule-proposals.json')), r.out);
  v(13, 'src/reservas.ts:1');
  r = run(DS, ['memory', 'propose']);
  const pf = path.join(tmp, '.dev-flow', 'memory', 'rule-proposals.json');
  const props = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')) : [];
  const p = props[0] || {};
  check('reglas: en 3 PRs propone una regla con los PRs y las líneas citadas como ejemplo malo', props.length === 1 && p.id === 'regla-resiliencia' && p.seen.prs.join() === '#11,#12,#13' && p.examples.bad.length === 3 && /api\.post\('\/pagos'/.test(p.examples.bad[0]) && /regla determinista/.test(fs.readFileSync(path.join(tmp, '.dev-flow', 'memory', 'proposals.md'), 'utf8')), JSON.stringify(props));
  check('reglas: un hallazgo que ya encontró un chequeo (fetch-sin-timeout) no se propone como regla', !props.some((x) => x.area === 'timeout'));
  check('reglas: la propuesta sin pattern ni ejemplo bueno no pasa rule-check ni rule-add', run(DS, ['memory', 'rule-check']).code === 1 && run(DS, ['memory', 'rule-add', '--id', 'regla-resiliencia']).code === 1 && !fs.existsSync(path.join(tmp, '.dev-flow', 'rules.json')));

  // Una regex que no encuentra todos los ejemplos malos no pasa; la buena, sí.
  props[0].pattern = 'retry\\(\\(\\) => api\\.post'; props[0].examples.good = ["await retry(() => api.post('/pagos', b, { headers: { 'Idempotency-Key': k } }))"]; props[0].exempt = 'Idempotency-Key';
  fs.writeFileSync(pf, JSON.stringify(props));
  r = run(DS, ['memory', 'rule-add', '--id', 'regla-resiliencia']);
  check('reglas: rule-add rechaza una regex que no encuentra uno de los ejemplos malos, y dice cuál', r.code === 1 && /withRetry/.test(r.out), r.out);
  props[0].pattern = '\\b(?:with)?[Rr]etry\\(\\s*\\(\\)\\s*=>\\s*\\w+\\.post\\(';
  fs.writeFileSync(pf, JSON.stringify(props));
  check('reglas: con la regex corregida, rule-check pasa', run(DS, ['memory', 'rule-check']).code === 0);
  r = run(DS, ['memory', 'rule-add', '--id', 'regla-resiliencia']);
  const rf = path.join(tmp, '.dev-flow', 'rules.json');
  const added = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, 'utf8')) : [];
  check('reglas: rule-add la pasa a .dev-flow/rules.json sin el campo seen, y la saca de las propuestas', r.code === 0 && added.length === 1 && !added[0].seen && JSON.parse(fs.readFileSync(pf, 'utf8')).length === 0, r.out);

  // audit.cjs la aplica sola en la rama siguiente.
  git(['checkout', '-q', '-b', 'feat/cobros']);
  w('src/cobros.ts', "export const cobrar = (b) => retry(() => api.post('/cobros', b));\nexport const ok = (b, k) => retry(() => api.post('/cobros', b, { headers: { 'Idempotency-Key': k } }));\n");
  w('test/cobros.test.ts', "retry(() => api.post('/x', b));\n");
  git(['add', '-A']); git(['commit', '-q', '-m', 'cobros']);
  r = run(AU, ['--no-honesty', '--json']);
  let j = {}; try { j = JSON.parse(r.stdout); } catch { /* */ }
  const hits = (j.findings || []).filter((f) => f.id === 'regla-resiliencia');
  check('audit: aplica la regla del proyecto a la línea agregada (no a la exenta ni a las pruebas)', hits.length === 1 && hits[0].where === 'src/cobros.ts:1' && hits[0].severity === 'P1' && (j.checks || []).some((c) => c.name === 'reglas del proyecto' && c.result === 'pasa'), JSON.stringify(j.findings));
  // Una regla rota en rules.json no se aplica y queda a la vista.
  fs.writeFileSync(rf, JSON.stringify([...added, { id: 'regla-rota', area: 'x', severity: 'P1', pattern: '(', issue: 'x', fix: 'y', examples: { bad: ['a'], good: ['b'] } }]));
  r = run(AU, ['--no-honesty', '--json']);
  j = {}; try { j = JSON.parse(r.stdout); } catch { /* */ }
  check('audit: una regla que no pasa su prueba no se aplica y figura en los chequeos como no-verificado', (j.checks || []).some((c) => c.name === 'reglas del proyecto' && c.result === 'no-verificado' && /regla-rota/.test(c.detail)) && !(j.findings || []).some((f) => f.id === 'regla-rota'));
  check('reglas: validate exige id con prefijo, severidad y ejemplos de los dos lados', R.validate({ id: 'x', severity: 'P9', pattern: 'a' }).length >= 3);

  fs.rmSync(tmp, { recursive: true, force: true });
};
