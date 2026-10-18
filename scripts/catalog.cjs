#!/usr/bin/env node
// Catálogo del marketplace contado desde los archivos (skills, subagentes, hooks, perfiles) y contrastado con el README.
// Los conteos a mano se desactualizan en cada release; este script los cuenta y falla si el README dice otra cosa.
// Además fija un tope a las descripciones de las skills automáticas: es lo único de una skill que entra en cada sesión.
// Uso: node scripts/catalog.cjs [--check] [--write] [--json]
//   --check (por defecto) sale con 1 si hay diferencias o si una descripción pasa el tope
//   --write corrige en el README los números que no coinciden
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIMITS = { descMax: 600, autoTotal: 4200 }; // caracteres; hoy ~3.300 en total y la más larga ~530
const WORDS = { 1: 'uno', 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 6: 'seis', 7: 'siete', 8: 'ocho', 9: 'nueve', 10: 'diez' };

function frontmatter(t) { const m = String(t).match(/^---\r?\n([\s\S]*?)\r?\n---/); return m ? m[1] : ''; }
function description(fm) {
  const m = fm.match(/^description:\s*(.*)$/m);
  if (!m) return '';
  let v = m[1].trim();
  if (/^[>|]-?$/.test(v)) { const rest = fm.slice(fm.indexOf(m[0]) + m[0].length).split(/\r?\n/); const L = []; for (const l of rest.slice(1)) { if (/^\S/.test(l)) break; L.push(l.trim()); } v = L.join(' '); }
  return v.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
}

function collect() {
  const plugins = {};
  for (const p of fs.readdirSync(path.join(ROOT, 'plugins')).sort()) {
    const dir = path.join(ROOT, 'plugins', p);
    if (!fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json'))) continue;
    const skills = [];
    const sd = path.join(dir, 'skills');
    if (fs.existsSync(sd)) for (const s of fs.readdirSync(sd).sort()) {
      const f = path.join(sd, s, 'SKILL.md');
      if (!fs.existsSync(f)) continue;
      const fm = frontmatter(fs.readFileSync(f, 'utf8'));
      skills.push({ name: s, auto: !/^disable-model-invocation:\s*true\s*$/m.test(fm), description: description(fm) });
    }
    const ad = path.join(dir, 'agents');
    const agents = fs.existsSync(ad) ? fs.readdirSync(ad).filter((f) => f.endsWith('.md')).length : 0;
    let hooks = 0;
    const hf = path.join(dir, 'hooks', 'hooks.json');
    if (fs.existsSync(hf)) {
      const scripts = new Set();
      for (const list of Object.values(JSON.parse(fs.readFileSync(hf, 'utf8')).hooks || {})) for (const x of list) for (const h of x.hooks || []) { const m = String(h.command || '').match(/([\w.-]+\.cjs)/); if (m) scripts.add(m[1]); }
      hooks = scripts.size;
    }
    plugins[p] = { skills: skills.length, auto: skills.filter((s) => s.auto).length, agents, hooks, list: skills };
  }
  const prof = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'profiles.json'), 'utf8'));
  const profiles = Object.fromEntries(prof.order.map((k) => [k, prof.profiles[k].plugins.reduce((a, p) => a + ((plugins[p] && plugins[p].auto) || 0), 0)]));
  const all = Object.values(plugins).flatMap((p) => p.list);
  return { plugins, profiles, total: all.length, manual: all.filter((s) => !s.auto).length, auto: all.filter((s) => s.auto), count: Object.keys(plugins).length };
}

function checks(cat, readme) {
  const out = []; // { what, found, want, re, group }
  const want = (what, re, value, group = 1) => { const m = readme.match(re); if (!m) { out.push({ what, missing: true }); return; } if (String(m[group]) !== String(value)) out.push({ what, found: m[group], want: value, re, group }); };
  for (const [p, c] of Object.entries(cat.plugins)) {
    const row = readme.split('\n').find((l) => l.startsWith(`| [\`${p}\`]`));
    if (!row) { out.push({ what: `fila de ${p} en la tabla de plugins`, missing: true }); continue; }
    const cell = (re, v, label) => { const m = row.match(re); if (v > 0 && !m) out.push({ what: `${p}: ${label}`, missing: true }); else if (m && Number(m[1]) !== v) out.push({ what: `${p}: ${label}`, found: m[1], want: v, row, re }); };
    cell(/(\d+) skills?\b/, c.skills, 'skills');
    cell(/(\d+) subagentes?\b/, c.agents, 'subagentes');
    cell(/(\d+) hooks?\b/, c.hooks, 'hooks');
  }
  want('cantidad de plugins (encabezado)', /(\d+) plugins modulares/, cat.count);
  want('skills manuales sobre el total', /(\d+) de las \d+ skills son manuales/, cat.manual);
  want('total de skills', /\d+ de las (\d+) skills son manuales/, cat.total);
  want('"se instalan los N"', /Se instalan los (\w+) una vez/, WORDS[cat.count] || cat.count);
  for (const [k, n] of Object.entries(cat.profiles)) want(`perfil ${k}: skills automáticas`, new RegExp(`^\\| \`${k}\` \\|[^\\n]*\\| [+~]?[\\d.]+ tokens \\| (\\d+) \\|`, 'm'), n);
  return out;
}

function limits(cat) {
  const out = [];
  for (const s of cat.auto) if (s.description.length > LIMITS.descMax) out.push(`descripción de ${s.name}: ${s.description.length} caracteres (tope ${LIMITS.descMax})`);
  const tot = cat.auto.reduce((a, s) => a + s.description.length, 0);
  if (tot > LIMITS.autoTotal) out.push(`descripciones de skills automáticas: ${tot} caracteres en total (tope ${LIMITS.autoTotal})`);
  return { out, tot };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const cat = collect();
  const rf = path.join(ROOT, 'README.md');
  let readme = fs.readFileSync(rf, 'utf8');
  const diff = checks(cat, readme);
  const lim = limits(cat);
  if (argv.includes('--json')) { console.log(JSON.stringify({ plugins: Object.fromEntries(Object.entries(cat.plugins).map(([k, v]) => [k, { skills: v.skills, auto: v.auto, agents: v.agents, hooks: v.hooks }])), profiles: cat.profiles, total: cat.total, manual: cat.manual, autoChars: lim.tot, readme: diff, limits: lim.out }, null, 2)); process.exit(diff.length || lim.out.length ? 1 : 0); }
  if (argv.includes('--write') && diff.length) {
    for (const d of diff.filter((x) => !x.missing)) {
      if (d.row) { const fixed = d.row.replace(d.re, (m) => m.replace(String(d.found), String(d.want))); readme = readme.replace(d.row, fixed); }
      else readme = readme.replace(d.re, (m, ...g) => m.replace(String(g[d.group - 1]), String(d.want)));
    }
    fs.writeFileSync(rf, readme);
    const left = checks(cat, readme);
    console.log(`README actualizado: ${diff.length - left.length} número(s) corregido(s).${left.length ? ` Quedan ${left.length} a mano:\n- ${left.map((d) => d.what).join('\n- ')}` : ''}`);
    process.exit(left.length || lim.out.length ? 1 : 0);
  }
  if (diff.length) console.log(`El README no coincide con los archivos:\n- ${diff.map((d) => (d.missing ? `${d.what}: no lo encuentro` : `${d.what}: dice ${d.found}, son ${d.want}`)).join('\n- ')}\nCorregilo con: node scripts/catalog.cjs --write`);
  if (lim.out.length) console.log(`Descripciones de skills automáticas por encima del tope (entran en cada sesión):\n- ${lim.out.join('\n- ')}`);
  if (!diff.length && !lim.out.length) console.log(`Catálogo al día: ${cat.count} plugins, ${cat.total} skills (${cat.auto.length} automáticas, ${lim.tot} caracteres de descripción), README coincide.`);
  process.exit(diff.length || lim.out.length ? 1 : 0);
}
module.exports = { collect, checks, limits, LIMITS };
