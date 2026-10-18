// dev-flow 2.7: señales de audit para backend y frontend. API primero (endpoint que cambia sin tocar el contrato
// OpenAPI), logs planos en código de servicio, datos asíncronos sin sus estados y componentes de presentación que piden datos.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = function apiUi({ check }) {
  const { apiAndUi } = require(path.join(__dirname, '..', 'plugins', 'dev-flow', 'skills', 'audit', 'scripts', 'audit.cjs'));
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aienv-au-')));
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
  // added: { archivo: [líneas agregadas] } con el mismo formato que addedLines de audit.
  const run = (d, changes) => { for (const [f, t] of Object.entries(changes)) w(d, f, t); git(d, ['add', '-A']); const files = Object.fromEntries(Object.entries(changes).map(([f, t]) => [f, t.split('\n').map((x, i) => ({ n: i + 1, t: x }))])); return apiAndUi(d, files); };
  const ids = (a) => a.map((x) => x.id);

  // --- Contrato
  let d = repo({ 'docs/api/openapi.yaml': 'openapi: 3.1.0\n', 'src/routes/costos.ts': '' });
  let f = run(d, { 'src/routes/costos.ts': "import express from 'express';\nconst router = express.Router();\nrouter.get('/costos', handler);\n" });
  check('audit: un endpoint que cambia sin tocar el contrato OpenAPI del repo es P1', f.some((x) => x.id === 'contrato-sin-actualizar' && x.severity === 'P1' && /openapi\.yaml/.test(x.issue)), JSON.stringify(f));
  d = repo({ 'docs/api/openapi.yaml': 'openapi: 3.1.0\n' });
  f = run(d, { 'docs/api/openapi.yaml': 'openapi: 3.1.0\npaths: {}\n', 'src/routes/costos.ts': "router.post('/costos', handler);\n" });
  check('audit: con el contrato actualizado en el mismo cambio, no hay hallazgo de contrato', !ids(f).some((x) => /contrato/.test(x)), JSON.stringify(f));
  d = repo({ 'README.md': 'x\n' });
  f = run(d, { 'src/Controllers/CostosController.cs': '[HttpGet("costos")]\npublic IActionResult Get() => Ok();\n' });
  check('audit: endpoint en un repo sin contrato es P2 (señal, no bloqueo)', f.some((x) => x.id === 'sin-contrato' && x.severity === 'P2'), JSON.stringify(f));
  check('audit: reconoce rutas de FastAPI', ids(run(repo({ 'a.txt': '' }), { 'app/main.py': "@app.get('/salud')\ndef salud():\n    return {}\n" })).includes('sin-contrato'));

  // --- Logs planos en servicio
  d = repo({ 'src/server.ts': "import express from 'express';\n" });
  f = run(d, { 'src/server.ts': "import express from 'express';\nconsole.log('arrancó', port);\n" });
  check('audit: console.log en código de servicio es P2 (logger estructurado con trace id)', f.some((x) => x.id === 'log-plano' && x.severity === 'P2'), JSON.stringify(f));
  f = run(d, { 'scripts/migrar.ts': "console.log('listo');\n" });
  check('audit: console.log en un script no cuenta', !ids(f).includes('log-plano'));

  // --- UI
  d = repo({ 'src/pages/Costos.tsx': '' });
  f = run(d, { 'src/pages/Costos.tsx': "const { data } = useQuery({ queryKey: ['c'], queryFn });\nreturn <Tabla filas={data} />;\n" });
  const st = f.find((x) => x.id === 'estados-async');
  check('audit: datos asíncronos sin carga, error ni vacío se marcan con lo que falta', st && /carga, error, vacío/.test(st.issue), JSON.stringify(f));
  f = run(d, { 'src/pages/Costos.tsx': "const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['c'], queryFn });\nif (isLoading) return <Skeleton />;\nif (isError) return <ErrorConReintento onRetry={refetch} />;\nif (!data?.length) return <Empty />;\nreturn <Tabla filas={data} />;\n" });
  check('audit: con los cuatro estados resueltos no hay hallazgo', !ids(f).includes('estados-async'), JSON.stringify(f));
  f = run(d, { 'src/components/ui/Card.tsx': "export function Card() { const r = fetch('/api/x'); return <div />; }\n" });
  check('audit: un componente de presentación que pide datos es P2', f.some((x) => x.id === 'datos-en-presentacional'), JSON.stringify(f));

  fs.rmSync(tmp, { recursive: true, force: true });
};
