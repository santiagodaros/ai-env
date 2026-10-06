#!/usr/bin/env node
// Verifica la arquitectura hexagonal de todos los architecture.json del repo.
// Uso: node arch-check.cjs [--dir <carpeta>] [--json]   Exit 1 si hay violaciones.
const fs = require('fs'), path = require('path');
const L = require('./archlib.cjs');
const argv = process.argv.slice(2);
const start = path.resolve(argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : process.cwd());
const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.git', '.claude', 'dist', 'build', '.venv', '__pycache__'].includes(e.name)) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p, acc) : acc.push(p); } return acc; };
const all = walk(start);
const configs = all.filter(f => path.basename(f) === 'architecture.json');
const viol = [];
for (const cf of configs) {
  let cfg; try { cfg = L.loadConfig(cf); } catch (e) { viol.push({ file: path.relative(start, cf), msg: e.message }); continue; }
  const rel = f => L.posix(path.relative(cfg.dir, f));
  const nested = configs.filter(o => o !== cf && path.dirname(o).startsWith(cfg.dir + path.sep)).map(o => path.dirname(o) + path.sep);
  const files = all.filter(f => f.startsWith(cfg.dir + path.sep) && L.isCode(f) && !nested.some(n => f.startsWith(n)));
  const ap = L.approvalState(cfg);
  const inLayers = files.filter(f => L.layerOf(cfg, rel(f)));
  if (!ap.approved && inLayers.length) viol.push({ file: path.relative(start, cf), msg: `hay código en las capas sin arquitectura aprobada (${ap.reason})` });
  for (const f of files) {
    const r = rel(f), layer = L.layerOf(cfg, r);
    if (!layer) { if (!L.allowedOutside(cfg, r)) viol.push({ file: path.relative(start, f), msg: 'código fuera de las capas declaradas' }); continue; }
    for (const v of L.checkText(cfg, r, fs.readFileSync(f, 'utf8'))) viol.push({ file: path.relative(start, f), line: v.line, msg: v.msg });
  }
}
if (argv.includes('--json')) console.log(JSON.stringify({ configs: configs.length, violations: viol }));
else if (!configs.length) console.log('Sin architecture.json: no hay arquitectura que verificar.');
else if (viol.length) console.error('VIOLACIONES DE ARQUITECTURA:\n' + viol.map(v => `- ${v.file}${v.line ? ':' + v.line : ''}: ${v.msg}`).join('\n'));
else console.log(`OK: ${configs.length} arquitectura(s) verificada(s).`);
process.exit(viol.length ? 1 : 0);
