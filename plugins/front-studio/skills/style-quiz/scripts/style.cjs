#!/usr/bin/env node
// Perillas de estilo de una página: valida, completa con el preset de la superficie y escribe design/style.json.
// Uso:
//   node style.cjs --preset operar|convencer|leer|experiencia [--set clave=valor ...] [--page slug] [--out design/style.json]
//   node style.cjs --check design/style.json
//   node style.cjs --schema
// Las perillas numéricas van de 0 a 10. Las demás son enumeradas (ver --schema). Fuera del rango de la superficie
// avisa (no falla): la dirección de diseño tiene que justificarlo.
'use strict';
const fs = require('fs');
const path = require('path');

const ENUMS = {
  surface: ['operar', 'convencer', 'leer', 'experiencia'],
  temperature: ['frio', 'neutro', 'calido'],
  contrast: ['medio', 'alto'],
  shape: ['recto', 'suave', 'redondo'],
  depth: ['plano', 'sutil', 'marcado'],
  type: ['geometrica', 'humanista', 'serif', 'tecnica'],
  accentUse: ['minimo', 'moderado', 'protagonista'],
  theme: ['claro', 'oscuro', 'ambos'],
  voice: ['sobria', 'cercana', 'tecnica', 'energica'],
};
const KNOBS = ['variance', 'motion', 'density'];
const PRESETS = {
  operar: { variance: 3, motion: 2, density: 7, temperature: 'neutro', contrast: 'medio', shape: 'suave', depth: 'plano', type: 'tecnica', accentUse: 'minimo', theme: 'ambos', voice: 'sobria' },
  convencer: { variance: 7, motion: 5, density: 3, temperature: 'neutro', contrast: 'alto', shape: 'suave', depth: 'sutil', type: 'geometrica', accentUse: 'protagonista', theme: 'claro', voice: 'cercana' },
  leer: { variance: 3, motion: 1, density: 4, temperature: 'calido', contrast: 'alto', shape: 'recto', depth: 'plano', type: 'serif', accentUse: 'minimo', theme: 'ambos', voice: 'sobria' },
  experiencia: { variance: 8, motion: 8, density: 3, temperature: 'calido', contrast: 'alto', shape: 'redondo', depth: 'marcado', type: 'humanista', accentUse: 'protagonista', theme: 'oscuro', voice: 'energica' },
};
// Rangos recomendados por superficie (references/surfaces.md).
const RANGES = {
  operar: { density: [6, 9], motion: [0, 3] },
  convencer: { density: [2, 5], motion: [3, 6] },
  leer: { density: [3, 5], motion: [0, 2] },
  experiencia: { density: [0, 10], motion: [5, 10] },
};

function normalize(input) {
  const errors = [], warnings = [];
  const surface = input.surface || 'operar';
  if (!ENUMS.surface.includes(surface)) errors.push(`surface: "${surface}" no es uno de ${ENUMS.surface.join(', ')}`);
  const s = { page: input.page || '', ...PRESETS[ENUMS.surface.includes(surface) ? surface : 'operar'], ...input, surface };
  for (const k of KNOBS) {
    const v = Number(s[k]);
    if (!Number.isFinite(v) || v < 0 || v > 10) errors.push(`${k}: tiene que ser un número de 0 a 10 (vino "${s[k]}")`);
    else s[k] = Math.round(v);
  }
  for (const [k, vals] of Object.entries(ENUMS)) if (k !== 'surface' && s[k] !== undefined && !vals.includes(s[k])) errors.push(`${k}: "${s[k]}" no es uno de ${vals.join(', ')}`);
  if (s.accent && !/^#[0-9a-fA-F]{6}$/.test(s.accent)) errors.push(`accent: "${s.accent}" tiene que ser #RRGGBB`);
  if (s.avoid && !Array.isArray(s.avoid)) s.avoid = String(s.avoid).split(',').map((x) => x.trim()).filter(Boolean);
  const r = RANGES[s.surface];
  if (r && !errors.length) for (const [k, [lo, hi]] of Object.entries(r)) if (s[k] < lo || s[k] > hi) warnings.push(`${k}=${s[k]} está fuera del rango habitual de "${s.surface}" (${lo}-${hi}); justificalo en design/direction.md`);
  return { style: s, errors, warnings };
}

function parseSet(pairs) {
  const o = {};
  for (const p of pairs) {
    const i = p.indexOf('=');
    if (i < 1) throw new Error(`--set espera clave=valor (vino "${p}")`);
    const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
    o[k] = KNOBS.includes(k) ? Number(v) : k === 'avoid' ? v.split(',').map((x) => x.trim()).filter(Boolean) : v;
  }
  return o;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--schema')) { console.log(JSON.stringify({ knobs: KNOBS.map((k) => `${k}: 0-10`), enums: ENUMS, presets: PRESETS, ranges: RANGES }, null, 2)); process.exit(0); }
  const ci = argv.indexOf('--check');
  if (ci >= 0) {
    const f = argv[ci + 1] || 'design/style.json';
    let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error(`${f}: ${e.message}`); process.exit(2); }
    const { errors, warnings } = normalize(j);
    for (const w of warnings) console.log(`AVISO ${w}`);
    for (const e of errors) console.log(`ERROR ${e}`);
    console.log(errors.length ? `${f}: inválido` : `${f}: válido`);
    process.exit(errors.length ? 1 : 0);
  }
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const sets = []; argv.forEach((a, i) => { if (a === '--set') for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) sets.push(argv[j]); });
  let extra; try { extra = parseSet(sets); } catch (e) { console.error(e.message); process.exit(2); }
  const out = get('--out') || 'design/style.json';
  let base = {};
  if (fs.existsSync(out) && !argv.includes('--reset')) { try { base = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { base = {}; } }
  const preset = get('--preset');
  const input = { ...base, ...(preset ? { surface: preset } : {}), ...extra, ...(get('--page') ? { page: get('--page') } : {}) };
  if (preset && base.surface && base.surface !== preset) for (const k of Object.keys(PRESETS.operar)) if (!(k in extra)) delete input[k]; // cambio de superficie: vuelve al preset salvo lo pedido
  const { style, errors, warnings } = normalize(input);
  for (const w of warnings) console.log(`AVISO ${w}`);
  if (errors.length) { for (const e of errors) console.error(`ERROR ${e}`); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(style, null, 2) + '\n');
  console.log(`Escrito ${out}: ${style.surface} · variación ${style.variance} · movimiento ${style.motion} · densidad ${style.density} · ${style.temperature} · ${style.shape} · ${style.depth} · ${style.type} · acento ${style.accentUse} · tema ${style.theme}`);
}

module.exports = { normalize, PRESETS, ENUMS, RANGES };
