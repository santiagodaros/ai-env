// Utilidades comunes de los analizadores de front-studio: recorrido de archivos, líneas y formato de hallazgos.
'use strict';
const fs = require('fs');
const path = require('path');

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.svelte-kit', 'coverage', '.turbo', '.vercel', 'out', 'shots']);
const UI_EXT = ['.html', '.htm', '.css', '.scss', '.sass', '.less', '.jsx', '.tsx', '.js', '.ts', '.vue', '.svelte', '.astro', '.mdx'];

// Junta archivos de las rutas pedidas. Una carpeta pasada explícitamente se recorre aunque se llame dist/.
function collect(inputs, exts = UI_EXT, maxBytes = 1_500_000) {
  const out = [];
  const seen = new Set();
  const add = (f) => {
    const abs = path.resolve(f);
    if (seen.has(abs) || !exts.includes(path.extname(abs).toLowerCase())) return;
    let st; try { st = fs.statSync(abs); } catch { return; }
    if (st.size > maxBytes) return;
    seen.add(abs);
    out.push({ file: abs, rel: path.relative(process.cwd(), abs) || path.basename(abs), text: fs.readFileSync(abs, 'utf8').replace(/^﻿/, '') });
  };
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(d, e.name)); }
      else add(path.join(d, e.name));
    }
  };
  for (const i of inputs) {
    if (!fs.existsSync(i)) throw new Error(`No existe: ${i}`);
    if (fs.statSync(i).isDirectory()) walk(i); else add(i);
  }
  return out;
}

function lineAt(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

// Todas las coincidencias de una regex global con su línea.
function matches(src, re) {
  const out = [];
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = g.exec(src.text))) { out.push({ m, file: src.rel, line: lineAt(src.text, m.index) }); if (m[0] === '') g.lastIndex++; }
  return out;
}

const where = (hits, n = 3) => hits.slice(0, n).map((h) => `${h.file}:${h.line}`).join(', ') + (hits.length > n ? ` (+${hits.length - n})` : '');

// Argumentos: posicionales + --flag valor + --bool.
function args(argv, bools = []) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) opt[k] = v;
      else if (bools.includes(k)) opt[k] = true;
      else opt[k] = argv[++i];
    } else pos.push(a);
  }
  return { pos, opt };
}

// Hallazgo con la forma común que entiende plan.cjs.
function finding(o) {
  return { source: o.source, id: o.id, title: o.title, severity: o.severity || 'P2', where: o.where || '', evidence: o.evidence || '', fix: o.fix || '', effort: o.effort || 'S', ...(o.wcag ? { wcag: o.wcag } : {}) };
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

module.exports = { collect, lineAt, matches, where, args, finding, writeJson, UI_EXT };
