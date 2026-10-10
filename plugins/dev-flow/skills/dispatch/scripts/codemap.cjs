#!/usr/bin/env node
// Mapa del código, determinista y sin modelo: un renglón por archivo con lo que exporta, sus funciones y sus
// dependencias locales. Para que un worker sepa dónde mirar sin leer el repo entero.
// Uso:
//   node codemap.cjs                     escribe docs/codemap.md (archivos versionados en git)
//   node codemap.cjs --slice a.ts b/     imprime solo esos archivos/carpetas y sus dependencias directas
//   node codemap.cjs --json
// Lenguajes: JS/TS, Python, PowerShell, C#, Go. Las notas de propósito que agregue un explorador se conservan:
// van en una línea "> nota:" debajo del archivo y no se pisan al regenerar.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CODE = /\.(c?[jt]sx?|mjs|py|ps1|psm1|cs|go)$/i;
const SKIP = /(^|\/)(node_modules|dist|build|vendor|\.dev-flow|\.claude|coverage|__pycache__)\//;

function files(root) {
  const r = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return (r.stdout || '').split('\n').filter((f) => f && CODE.test(f) && !SKIP.test(f)).slice(0, 3000);
}

function analyze(root, rel) {
  let t = '';
  try { t = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; }
  const ext = path.extname(rel).toLowerCase();
  const exp = new Set(), fns = new Set(), deps = new Set();
  const add = (s, v) => { if (v && s.size < 25) s.add(v); };
  if (/\.(c?[jt]sx?|mjs)$/.test(ext)) {
    for (const m of t.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) add(exp, m[1]);
    for (const m of t.matchAll(/^export\s*\{([^}]+)\}/gm)) for (const n of m[1].split(',')) add(exp, n.trim().split(/\s+as\s+/).pop());
    for (const m of t.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) add(exp, m[1]);
    for (const m of t.matchAll(/module\.exports\s*=\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) add(exp, n.trim().split(':')[0].trim());
    for (const m of t.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) add(fns, m[1]);
    for (const m of t.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) add(deps, m[1]);
  } else if (ext === '.py') {
    for (const m of t.matchAll(/^(?:async\s+)?def\s+([A-Za-z_]\w*)/gm)) add(m[1].startsWith('_') ? fns : exp, m[1]);
    for (const m of t.matchAll(/^class\s+([A-Za-z_]\w*)/gm)) add(exp, m[1]);
    for (const m of t.matchAll(/^from\s+(\.+[\w.]*)\s+import/gm)) add(deps, m[1]);
  } else if (/\.ps(m)?1$/.test(ext)) {
    for (const m of t.matchAll(/^\s*function\s+([\w-]+)/gim)) add(exp, m[1]);
    for (const m of t.matchAll(/^\s*\.\s+["']?(\$PSScriptRoot[\\/][^"'\s]+)/gim)) add(deps, m[1]);
    for (const m of t.matchAll(/Import-Module\s+["']?(\.[\\/][^"'\s]+)/gi)) add(deps, m[1]);
  } else if (ext === '.cs') {
    for (const m of t.matchAll(/public\s+(?:static\s+|sealed\s+|abstract\s+|partial\s+)*(?:class|interface|record|enum)\s+(\w+)/g)) add(exp, m[1]);
    for (const m of t.matchAll(/public\s+(?:static\s+|async\s+|virtual\s+|override\s+)*[\w<>\[\],?]+\s+(\w+)\s*\(/g)) add(fns, m[1]);
  } else if (ext === '.go') {
    for (const m of t.matchAll(/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/gm)) add(exp, m[1]);
    for (const m of t.matchAll(/^type\s+([A-Z]\w*)/gm)) add(exp, m[1]);
  }
  const resolved = [...deps].map((d) => {
    if (!d.startsWith('.')) return d;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), d.replace(/^(\.+)(?=\w)/, (x) => (x.length > 1 ? '../'.repeat(x.length - 1) : './'))));
    return base;
  });
  return { file: rel, lines: t.split('\n').length, exports: [...exp], functions: [...fns].filter((f) => !exp.has(f)).slice(0, 12), deps: resolved };
}

function notesFrom(md) {
  const notes = {};
  let cur = null;
  for (const l of String(md || '').split('\n')) {
    const f = l.match(/^- `([^`]+)`/); if (f) { cur = f[1]; continue; }
    const n = l.match(/^\s+> nota: (.+)$/); if (n && cur) notes[cur] = n[1];
  }
  return notes;
}

function build(root) {
  const list = files(root).map((f) => analyze(root, f)).filter(Boolean);
  return list;
}

function render(list, notes = {}) {
  const byDir = {};
  for (const x of list) (byDir[path.posix.dirname(x.file)] = byDir[path.posix.dirname(x.file)] || []).push(x);
  const L = ['# Mapa del código', '', `Generado por dev-flow (codemap.cjs) el ${new Date().toISOString().slice(0, 10)}: ${list.length} archivo(s). Regenerar: node codemap.cjs. Las líneas "> nota:" se conservan.`, ''];
  for (const d of Object.keys(byDir).sort()) {
    L.push(`## ${d === '.' ? '(raíz)' : d}`, '');
    for (const x of byDir[d].sort((a, b) => a.file.localeCompare(b.file))) {
      const parts = [`${x.lines} líneas`];
      if (x.exports.length) parts.push(`exporta ${x.exports.join(', ')}`);
      if (x.functions.length) parts.push(`internas ${x.functions.join(', ')}`);
      if (x.deps.length) parts.push(`usa ${x.deps.join(', ')}`);
      L.push(`- \`${x.file}\` — ${parts.join(' · ')}`);
      if (notes[x.file]) L.push(`  > nota: ${notes[x.file]}`);
    }
    L.push('');
  }
  return L.join('\n');
}

// Solo lo que pide el alcance de un ticket, más las dependencias directas de esos archivos.
function slice(root, wanted) {
  const md = (() => { try { return fs.readFileSync(path.join(root, 'docs', 'codemap.md'), 'utf8'); } catch { return ''; } })();
  const list = build(root);
  const norm = wanted.map((w) => w.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/?\*+$/, ''));
  const hit = list.filter((x) => norm.some((w) => x.file === w || x.file.startsWith(w + '/')));
  const depFiles = new Set(hit.flatMap((x) => x.deps));
  const near = list.filter((x) => !hit.includes(x) && [...depFiles].some((d) => x.file === d || x.file.replace(/\.\w+$/, '') === d.replace(/\.\w+$/, '') || x.file.replace(/\.\w+$/, '') === d));
  if (!hit.length && !near.length) return '';
  return render([...hit, ...near], notesFrom(md)).split('\n').slice(3).join('\n').trim().slice(0, 4000);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const root = (() => { const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : process.cwd(); })();
  const si = argv.indexOf('--slice');
  if (si >= 0) { const s = slice(root, argv.slice(si + 1)); console.log(s || '(nada en el mapa para ese alcance)'); process.exit(0); }
  const list = build(root);
  if (argv.includes('--json')) { console.log(JSON.stringify(list, null, 2)); process.exit(0); }
  const out = path.join(root, 'docs', 'codemap.md');
  let prev = ''; try { prev = fs.readFileSync(out, 'utf8'); } catch { /* nuevo */ }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render(list, notesFrom(prev)) + '\n');
  console.log(`Escrito docs/codemap.md: ${list.length} archivo(s).`);
}
module.exports = { build, render, slice, analyze };
