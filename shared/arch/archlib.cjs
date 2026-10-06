// FUENTE ÚNICA: shared/. Los plugins llevan una copia porque un plugin instalado no puede leer archivos de otro.
// Después de editar: node scripts/sync-shared.cjs
// Núcleo de arch-first: contrato architecture.json, resolución de capas, chequeo de imports y aprobación por hash.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const posix = p => p.replace(/\\/g, '/');
const CODE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.ps1', '.psm1'];
const langOf = f => (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f) ? 'ts' : /\.py$/i.test(f) ? 'py' : /\.(ps1|psm1)$/i.test(f) ? 'ps1' : null);
const isCode = f => CODE_EXT.includes(path.extname(f).toLowerCase());

function findConfig(startDir, stopDir) {
  let d = path.resolve(startDir); const stop = path.resolve(stopDir || path.parse(d).root);
  for (;;) {
    const f = path.join(d, 'architecture.json');
    if (fs.existsSync(f)) return { file: f, dir: d };
    if (d === stop || path.dirname(d) === d) return null;
    d = path.dirname(d);
  }
}
function loadConfig(file) {
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  c.dir = path.dirname(file);
  if (!c.layers || !c.layers.domain || !c.layers.application) throw new Error('architecture.json: faltan las capas domain y application');
  for (const [n, l] of Object.entries(c.layers)) { l.paths = (l.paths || (l.path ? [l.path] : [])).map(p => posix(p).replace(/\/$/, '')); l.mayImport = l.mayImport || [n]; if (!l.mayImport.includes(n)) l.mayImport.push(n); }
  c.coreLayers = c.coreLayers || ['domain', 'application'];
  c.forbiddenInCore = c.forbiddenInCore || [];
  c.envOnlyIn = c.envOnlyIn || ['config', 'outbound'];
  c.aliases = c.aliases || {};
  c.allowOutside = (c.allowOutside || ['tests/', 'test/', 'scripts/', 'docs/', '.github/', '.claude/', 'node_modules/']).map(posix);
  return c;
}
function layerOf(cfg, rel) {
  rel = posix(rel); let best = null, len = -1;
  for (const [n, l] of Object.entries(cfg.layers)) for (const p of l.paths) if ((rel === p || rel.startsWith(p + '/')) && p.length > len) { best = n; len = p.length; }
  return best;
}
const allowedOutside = (cfg, rel) => { rel = posix(rel); const base = path.posix.basename(rel); return cfg.allowOutside.some(a => (a.endsWith('/') ? rel === a.slice(0, -1) || rel.startsWith(a) : rel === a)) || /\.(config|test|spec)\.[a-z]+$/i.test(base) || /^\.?[\w.-]*(rc|config)\.(c?js|json|ts)$/i.test(base) || /\.d\.ts$/.test(base); };

function extractImports(lang, text) {
  const out = [], lines = text.split(/\r?\n/);
  const add = (spec, idx) => out.push({ spec, line: idx + 1 });
  lines.forEach((ln, i) => {
    if (lang === 'ts') {
      for (const m of ln.matchAll(/(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g)) add(m[1], i);
      for (const m of ln.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1], i);
      for (const m of ln.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1], i);
    } else if (lang === 'py') {
      let m = ln.match(/^\s*from\s+(\.*[\w.]*)\s+import\s/); if (m) add(m[1], i);
      else if ((m = ln.match(/^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/))) m[1].split(',').forEach(x => add(x.trim(), i));
    } else if (lang === 'ps1') {
      for (const m of ln.matchAll(/Import-Module\s+['"]?([^\s'"]+)/gi)) add(m[1], i);
      const d = ln.match(/^\s*\.\s+['"]?([^\s'"]+\.ps1)/i); if (d) add(d[1], i);
    }
  });
  return out;
}
function resolveImport(cfg, lang, fromRel, spec) {
  const dir = path.posix.dirname(posix(fromRel));
  if (lang === 'ts') {
    if (spec.startsWith('.')) return { internal: path.posix.normalize(path.posix.join(dir, spec)) };
    for (const [pre, tgt] of Object.entries(cfg.aliases)) if (spec.startsWith(pre)) return { internal: path.posix.normalize(posix(tgt) + spec.slice(pre.length)) };
    const s = spec.replace(/^node:/, ''); return { external: s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0] };
  }
  if (lang === 'py') {
    if (spec.startsWith('.')) { const dots = spec.match(/^\.+/)[0].length; let base = dir; for (let i = 1; i < dots; i++) base = path.posix.dirname(base); return { internal: path.posix.normalize(path.posix.join(base, spec.slice(dots).replace(/\./g, '/'))) }; }
    const asPath = spec.replace(/\./g, '/');
    for (const c of [asPath, 'src/' + asPath]) if (layerOf(cfg, c)) return { internal: c };
    return { external: spec.split('.')[0] };
  }
  if (lang === 'ps1') {
    if (/[\\/]/.test(spec) || /\.ps1$|\.psm1$/i.test(spec)) return { internal: path.posix.normalize(path.posix.join(dir, posix(spec.replace(/\$PSScriptRoot/gi, '.')))) };
    return { external: spec };
  }
  return { external: spec };
}
const ENV = { ts: /process\.env|import\.meta\.env/, py: /os\.environ|os\.getenv/, ps1: /\$env:/i };
const forbidden = (cfg, name) => cfg.forbiddenInCore.some(f => (f.endsWith('/') || f.endsWith('.')) ? name.startsWith(f) : name === f || name.startsWith(f + '/'));

function checkText(cfg, rel, text) {
  rel = posix(rel); const lang = langOf(rel); if (!lang) return [];
  const from = layerOf(cfg, rel); if (!from) return [];
  const v = [];
  for (const imp of extractImports(lang, text)) {
    const r = resolveImport(cfg, lang, rel, imp.spec);
    if (r.internal) {
      const to = layerOf(cfg, r.internal);
      if (!to) { if (!allowedOutside(cfg, r.internal)) v.push({ line: imp.line, msg: `importa "${imp.spec}", que queda fuera de las capas declaradas` }); }
      else if (!cfg.layers[from].mayImport.includes(to)) v.push({ line: imp.line, msg: `la capa ${from} no puede importar de ${to} ("${imp.spec}"). Las dependencias apuntan hacia adentro` });
    } else if (cfg.coreLayers.includes(from) && forbidden(cfg, r.external)) {
      v.push({ line: imp.line, msg: `${from} no puede depender de "${r.external}": es infraestructura, va detrás de un puerto en un adaptador` });
    }
  }
  if (!cfg.envOnlyIn.includes(from) && ENV[lang]) text.split(/\r?\n/).forEach((ln, i) => { if (ENV[lang].test(ln)) v.push({ line: i + 1, msg: `lee variables de entorno en ${from}: la configuración entra solo por ${cfg.envOnlyIn.join(' o ')}` }); });
  return v;
}

const archPaths = cfg => ({ md: path.join(cfg.dir, 'docs', 'architecture', 'ARCHITECTURE.md') });
function approvalHash(cfg) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(path.join(cfg.dir, 'architecture.json'), 'utf8').replace(/\r\n/g, '\n'));
  let md = ''; try { md = fs.readFileSync(archPaths(cfg).md, 'utf8').replace(/\r\n/g, '\n'); } catch { /* sin documento */ }
  h.update(md.split('\n').filter(l => !/^(Estado|Aprobada-hash):/i.test(l)).join('\n'));
  return h.digest('hex');
}
function approvalState(cfg) {
  let md; try { md = fs.readFileSync(archPaths(cfg).md, 'utf8'); } catch { return { approved: false, reason: 'falta docs/architecture/ARCHITECTURE.md' }; }
  if (!/^Estado:\s*aprobada/im.test(md)) return { approved: false, reason: 'ARCHITECTURE.md no está aprobada' };
  const m = md.match(/^Aprobada-hash:\s*([0-9a-f]{64})/im);
  if (!m) return { approved: false, reason: 'falta el sello de aprobación' };
  if (m[1] !== approvalHash(cfg)) return { approved: false, reason: 'el diseño cambió después de la aprobación: hay que aprobarlo de nuevo' };
  return { approved: true };
}
module.exports = { posix, isCode, langOf, findConfig, loadConfig, layerOf, allowedOutside, extractImports, resolveImport, checkText, approvalHash, approvalState, archPaths, CODE_EXT };
