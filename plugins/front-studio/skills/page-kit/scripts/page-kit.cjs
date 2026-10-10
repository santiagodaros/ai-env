#!/usr/bin/env node
// Kit de diseño de UNA página: hereda la marca global y la ajusta con las perillas de style.json.
// Uso: node page-kit.cjs --page <slug> [--style design/style.json] [--brand design/tokens.css] [--accent #RRGGBB]
//                        [--out design/pages] [--json]
// Escribe design/pages/<slug>/: tokens.css, tokens.json (formato DTCG), tailwind.css (Tailwind v4), specimen.html y kit.md.
// Colores en OKLCH (escalas perceptuales); cada rol de texto y de control se verifica con contraste WCAG y se corrige
// caminando la escala hasta que pasa. Sale con 1 si algún par obligatorio no se pudo resolver.
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../../../lib/color.cjs');
const { normalize } = require('../../style-quiz/scripts/style.cjs');

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const LS = [0.975, 0.94, 0.885, 0.81, 0.72, 0.63, 0.54, 0.46, 0.38, 0.30, 0.22];
const NLS = [0.985, 0.955, 0.91, 0.84, 0.71, 0.58, 0.48, 0.40, 0.31, 0.235, 0.17];
const SEM = { success: 150, warning: 75, danger: 27, info: 245 };
const DEFAULT_ANCHOR = { frio: '#1d6f86', neutro: '#3f5b85', calido: '#a4442f' };
const FONTS = {
  geometrica: { display: ['Sora', 'system-ui, sans-serif'], body: ['Manrope', 'system-ui, sans-serif'] },
  humanista: { display: ['Bricolage Grotesque', 'system-ui, sans-serif'], body: ['Source Sans 3', 'system-ui, sans-serif'] },
  serif: { display: ['Newsreader', 'Georgia, serif'], body: ['Source Serif 4', 'Georgia, serif'] },
  tecnica: { display: ['IBM Plex Sans Condensed', 'system-ui, sans-serif'], body: ['IBM Plex Sans', 'system-ui, sans-serif'], mono: ['IBM Plex Mono', 'ui-monospace, Consolas, monospace'] },
};
const RATIO = { operar: [1.125, 1.25], convencer: [1.2, 1.5], leer: [1.2, 1.333], experiencia: [1.25, 1.618] };
const RADII = { recto: { xs: 0, sm: 2, md: 3, lg: 4 }, suave: { xs: 2, sm: 4, md: 8, lg: 12 }, redondo: { xs: 4, sm: 8, md: 14, lg: 22 } };

function arg(argv, k) { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; }

// --- Marca global: variables de design/tokens.css
function parseBrand(file) {
  if (!file || !fs.existsSync(file)) return null;
  const css = fs.readFileSync(file, 'utf8');
  const root = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]).join(';');
  const vars = {}; for (const d of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) vars[d[1]] = d[2].trim();
  const find = (names) => { for (const n of names) { const v = vars[n]; if (v && C.parse(v)) return { name: n, value: C.hex(C.parse(v)) }; } return null; };
  const font = (names) => { for (const n of names) if (vars[n]) return { name: n, value: vars[n] }; return null; };
  return {
    file,
    accent: find(['--color-accent', '--color-primary', '--color-brand', '--accent', '--primary', '--brand']),
    bg: find(['--color-bg', '--color-background', '--bg', '--background']),
    surface: find(['--color-surface', '--surface']),
    text: find(['--color-text', '--color-fg', '--text', '--fg', '--foreground']),
    display: font(['--font-display', '--font-heading', '--font-title']),
    body: font(['--font-body', '--font-sans', '--font-text', '--font-base', '--font']),
    mono: font(['--font-mono', '--font-data', '--font-code']),
  };
}

// --- Escalas
function scale(anchorHex, ls = LS, chromaMax = 0.2) {
  const rgb = C.parse(anchorHex), a = C.rgbToOklch(rgb);
  const out = {};
  STEPS.forEach((s, i) => {
    const bell = 1 - Math.pow(Math.abs(ls[i] - 0.6) / 0.45, 2) * 0.75;
    out[s] = C.hex(C.oklchToRgb({ l: ls[i], c: Math.min(a.c, chromaMax) * Math.max(0.12, bell), h: a.h }));
  });
  let idx = 0; ls.forEach((l, i) => { if (Math.abs(l - a.l) < Math.abs(ls[idx] - a.l)) idx = i; });
  out[STEPS[idx]] = C.hex(rgb); // el ancla aparece tal cual en la escala
  return { steps: out, anchorStep: STEPS[idx] };
}
function neutral(hue, chroma) {
  const out = {}; STEPS.forEach((s, i) => { out[s] = C.hex(C.oklchToRgb({ l: NLS[i], c: chroma * (i === 0 || i === 10 ? 0.6 : 1), h: hue })); }); return out;
}

// Camina la escala desde `start` hacia `dir` hasta que el color contraste ≥ min con todos los fondos.
function walk(sc, start, dir, against, min) {
  const order = dir === 'darker' ? STEPS : [...STEPS].reverse();
  let i = order.indexOf(start); if (i < 0) i = 0;
  for (; i < order.length; i++) {
    const hex = sc[order[i]];
    const ratios = against.map((b) => C.contrast(b, hex));
    if (ratios.every((r) => r >= min)) return { hex, step: order[i], ratio: Math.min(...ratios), ok: true, moved: order[i] !== start };
  }
  const hex = sc[order[order.length - 1]];
  return { hex, step: order[order.length - 1], ratio: Math.min(...against.map((b) => C.contrast(b, hex))), ok: false, moved: true };
}

function build(style, brand, accentOpt) {
  const notes = { inherited: [], adjusted: [] };
  const anchor = accentOpt || brand?.accent?.value || style.accent || DEFAULT_ANCHOR[style.temperature];
  if (accentOpt) notes.adjusted.push(`Acento ${accentOpt} pasado con --accent (reemplaza el de la marca).`);
  else if (brand?.accent) notes.inherited.push(`Acento ${brand.accent.value} (${brand.accent.name} de ${path.basename(brand.file)}).`);
  else if (style.accent) notes.inherited.push(`Acento ${style.accent} (de style.json; no hay acento en la marca).`);
  else notes.adjusted.push(`Sin marca ni acento: ancla provisoria ${anchor} según temperatura "${style.temperature}". Reemplazala por un color real del producto.`);
  const A = scale(anchor, LS, style.accentUse === 'minimo' ? 0.16 : 0.24);
  const ah = C.rgbToOklch(C.parse(anchor)).h;
  const nh = style.temperature === 'frio' ? 250 : style.temperature === 'calido' ? 65 : ah;
  const N = neutral(nh, style.temperature === 'neutro' ? 0.008 : 0.012);
  const S = Object.fromEntries(Object.entries(SEM).map(([k, h]) => [k, scale(C.hex(C.oklchToRgb({ l: 0.6, c: 0.15, h })), LS, 0.17).steps]));
  const textMin = style.contrast === 'alto' ? 7 : 4.5;
  const pairs = [];
  const req = (theme, name, fg, bg, min, kind = 'texto') => pairs.push({ theme, name, fg, bg, ratio: +C.contrast(bg, fg).toFixed(2), min, kind, ok: C.contrast(bg, fg) >= min - 1e-9 });

  function roles(theme) {
    const L = theme === 'light';
    const r = {};
    r.bg = L ? N[50] : N[950];
    r.surface = L ? C.hex(C.oklchToRgb({ l: 0.997, c: 0.003, h: nh })) : N[900];
    r['surface-2'] = L ? N[100] : N[800];
    if (L && brand?.bg && C.luminance(C.parse(brand.bg.value)) > 0.6) { r.bg = brand.bg.value; notes.inherited.push(`Fondo claro ${brand.bg.value} (${brand.bg.name}).`); }
    if (L && brand?.surface && C.luminance(C.parse(brand.surface.value)) > 0.6) { r.surface = brand.surface.value; notes.inherited.push(`Superficie ${brand.surface.value} (${brand.surface.name}).`); }
    const backs = [r.bg, r.surface];
    let t = walk(N, L ? (style.contrast === 'alto' ? 950 : 900) : 50, L ? 'darker' : 'lighter', backs, textMin);
    if (L && brand?.text) {
      const ok = backs.every((b) => C.contrast(b, brand.text.value) >= textMin);
      if (ok) { t = { hex: brand.text.value, ok: true }; notes.inherited.push(`Texto ${brand.text.value} (${brand.text.name}).`); }
      else notes.adjusted.push(`Texto de la marca ${brand.text.value} no llega a ${textMin}:1 sobre el fondo de esta página: se usa ${t.hex}.`);
    }
    r.text = t.hex;
    r['text-muted'] = walk(N, L ? 600 : 400, L ? 'darker' : 'lighter', [...backs, r['surface-2']], 4.5).hex;
    r.border = L ? N[200] : N[800];
    r['border-strong'] = walk(N, L ? 400 : 500, L ? 'darker' : 'lighter', backs, 3).hex;
    // Acento
    const startText = L ? Math.max(A.anchorStep, 600) : Math.min(A.anchorStep, 400);
    const at = walk(A.steps, startText, L ? 'darker' : 'lighter', backs, 4.5);
    r['accent-text'] = at.hex;
    const anchorHex = A.steps[A.anchorStep];
    let solid = anchorHex, on = '#ffffff';
    if (C.contrast(anchorHex, '#ffffff') >= 4.5) on = '#ffffff';
    else if (C.contrast(anchorHex, N[950]) >= 4.5) on = N[950];
    else {
      const w = walk(A.steps, A.anchorStep, 'darker', ['#ffffff'], 4.5); solid = w.hex; on = '#ffffff';
      if (theme === 'light') notes.adjusted.push(`El acento ${anchorHex} no da 4,5:1 con texto blanco ni oscuro: el botón usa ${solid} (paso ${w.step}).`);
    }
    r.accent = solid; r['on-accent'] = on;
    r['accent-soft'] = L ? A.steps[100] : A.steps[900];
    r['accent-soft-text'] = walk(A.steps, L ? Math.max(A.anchorStep, 700) : 200, L ? 'darker' : 'lighter', [r['accent-soft']], 4.5).hex;
    r.focus = walk(A.steps, L ? Math.max(A.anchorStep, 500) : 400, L ? 'darker' : 'lighter', backs, 3).hex;
    for (const k of Object.keys(SEM)) {
      r[`${k}-soft`] = L ? S[k][100] : S[k][900];
      r[k] = walk(S[k], L ? 700 : 300, L ? 'darker' : 'lighter', [...backs, r[`${k}-soft`]], 4.5).hex;
    }
    // Pares obligatorios
    for (const b of ['bg', 'surface']) {
      req(theme, `text / ${b}`, r.text, r[b], textMin);
      req(theme, `text-muted / ${b}`, r['text-muted'], r[b], 4.5);
      req(theme, `accent-text / ${b}`, r['accent-text'], r[b], 4.5);
      req(theme, `border-strong / ${b}`, r['border-strong'], r[b], 3, 'control');
      req(theme, `focus / ${b}`, r.focus, r[b], 3, 'control');
    }
    req(theme, 'text-muted / surface-2', r['text-muted'], r['surface-2'], 4.5);
    req(theme, 'on-accent / accent', r['on-accent'], r.accent, 4.5);
    req(theme, 'accent-soft-text / accent-soft', r['accent-soft-text'], r['accent-soft'], 4.5);
    for (const k of Object.keys(SEM)) { req(theme, `${k} / bg`, r[k], r.bg, 4.5); req(theme, `${k} / ${k}-soft`, r[k], r[`${k}-soft`], 4.5); }
    return r;
  }
  const light = roles('light'), dark = roles('dark');

  // Tipografía
  const [rlo, rhi] = RATIO[style.surface];
  const ratio = +Math.min(rhi, Math.max(rlo, 1.125 + style.variance * 0.0375)).toFixed(3);
  const base = style.surface === 'leer' ? 18 : style.density >= 8 ? 14 : style.density >= 5 ? 15 : 16;
  const names = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', ...(['convencer', 'experiencia'].includes(style.surface) ? ['5xl'] : [])];
  const type = names.map((n, i) => {
    const k = i - 2;
    const px = Math.max(12, Math.round(base * Math.pow(ratio, k)));
    const lh = k <= 0 ? (style.surface === 'leer' ? 1.65 : 1.5) : k === 1 ? 1.4 : k === 2 ? 1.3 : k === 3 ? 1.2 : 1.1;
    const ls = k >= 5 ? '-0.02em' : k >= 3 ? '-0.01em' : '0';
    // Tamaños grandes fluidos: del 60 % (mínimo 28px) a 360px de ancho hasta el valor pleno a 1280px.
    let fluid = null;
    if (px >= 36) {
      const min = Math.max(28, Math.round(px * 0.6)), slope = (px - min) / 920;
      fluid = `clamp(${+(min / 16).toFixed(3)}rem, ${+((min - 360 * slope) / 16).toFixed(3)}rem + ${+(slope * 100).toFixed(3)}vw, ${+(px / 16).toFixed(3)}rem)`;
    }
    return { name: n, px, rem: +(px / 16).toFixed(4), lh, ls, fluid };
  });
  const F = FONTS[style.type];
  const fonts = {
    display: brand?.display ? brand.display.value : `"${F.display[0]}", ${F.display[1]}`,
    body: brand?.body ? brand.body.value : `"${F.body[0]}", ${F.body[1]}`,
    mono: brand?.mono ? brand.mono.value : F.mono ? `"${F.mono[0]}", ${F.mono[1]}` : 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  };
  for (const k of ['display', 'body', 'mono']) if (brand?.[k]) notes.inherited.push(`Fuente ${k}: ${brand[k].value} (${brand[k].name}).`);
  const google = [!brand?.display && F.display[0], !brand?.body && F.body[0], !brand?.mono && F.mono && F.mono[0]].filter(Boolean);
  const googleUrl = google.length ? `https://fonts.googleapis.com/css2?${[...new Set(google)].map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&')}&display=swap` : null;

  // Espaciado, radios, sombras, movimiento
  const factor = style.density <= 3 ? 1.25 : style.density <= 6 ? 1 : 0.875;
  const space = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((m) => (m === 0 ? 0 : Math.max(1, Math.round(m * 4 * factor))));
  const radii = { ...RADII[style.shape], pill: 9999 };
  const [nr, ng, nb] = C.parse(N[950]);
  const sh = (y, b, a) => `0 ${y}px ${b}px rgba(${nr}, ${ng}, ${nb}, ${a})`;
  const shadows = style.depth === 'plano'
    ? { 1: 'none', 2: 'none', overlay: `${sh(8, 24, 0.16)}, ${sh(2, 6, 0.08)}` }
    : style.depth === 'sutil'
      ? { 1: `${sh(1, 2, 0.06)}, ${sh(1, 1, 0.04)}`, 2: `${sh(4, 12, 0.08)}, ${sh(1, 3, 0.05)}`, overlay: `${sh(12, 32, 0.16)}, ${sh(2, 6, 0.08)}` }
      : { 1: `${sh(2, 4, 0.1)}, ${sh(1, 2, 0.06)}`, 2: `${sh(8, 20, 0.14)}, ${sh(2, 6, 0.08)}`, overlay: `${sh(20, 48, 0.24)}, ${sh(4, 12, 0.12)}` };
  const m = style.motion;
  const motion = {
    fast: Math.round(80 + m * 7), base: Math.round(120 + m * 16), slow: Math.round(160 + m * 32),
    easeOut: 'cubic-bezier(0.2, 0, 0, 1)', easeIn: 'cubic-bezier(0.4, 0, 1, 1)', easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: m >= 7 ? 'cubic-bezier(0.34, 1.4, 0.64, 1)' : null, stagger: m >= 5 ? 30 : 0, entrance: m >= 5,
  };
  return { anchor, A: A.steps, anchorStep: A.anchorStep, N, S, light, dark, pairs, type, ratio, base, fonts, googleUrl, space, factor, radii, shadows, motion, notes };
}

// --- Salidas
function cssVars(k) {
  const L = [];
  for (const s of STEPS) L.push(`  --accent-${s}: ${k.A[s]};`);
  for (const s of STEPS) L.push(`  --neutral-${s}: ${k.N[s]};`);
  for (const [n, sc] of Object.entries(k.S)) for (const s of STEPS) L.push(`  --${n}-${s}: ${sc[s]};`);
  L.push(`  --font-display: ${k.fonts.display};`, `  --font-body: ${k.fonts.body};`, `  --font-mono: ${k.fonts.mono};`);
  for (const t of k.type) L.push(`  --text-${t.name}: ${t.fluid || `${t.rem}rem`}; --lh-${t.name}: ${t.lh}; --ls-${t.name}: ${t.ls};`);
  k.space.forEach((v, i) => L.push(`  --space-${i}: ${v}px;`));
  for (const [n, v] of Object.entries(k.radii)) L.push(`  --radius-${n}: ${v}px;`);
  L.push('  --radius-control: var(--radius-sm); --radius-card: var(--radius-md); --radius-panel: var(--radius-lg);');
  for (const [n, v] of Object.entries(k.shadows)) L.push(`  --shadow-${n}: ${v};`);
  L.push(`  --dur-fast: ${k.motion.fast}ms; --dur-base: ${k.motion.base}ms; --dur-slow: ${k.motion.slow}ms;`);
  L.push(`  --ease-out: ${k.motion.easeOut}; --ease-in: ${k.motion.easeIn}; --ease-in-out: ${k.motion.easeInOut};${k.motion.spring ? ` --ease-spring: ${k.motion.spring};` : ''}`);
  L.push(`  --stagger: ${k.motion.stagger}ms;`);
  return L.join('\n');
}
const roleVars = (r) => Object.entries(r).map(([n, v]) => `  --${n}: ${v};`).join('\n');

function tokensCss(k, style, slug) {
  const darkFirst = style.theme === 'oscuro';
  const def = darkFirst ? k.dark : k.light, alt = darkFirst ? k.light : k.dark;
  const altScheme = darkFirst ? 'light' : 'dark', defScheme = darkFirst ? 'dark' : 'light';
  return `/* Kit de la página "${slug}" — generado por front-studio page-kit. No editar a mano:
   cambiá design/style.json o la marca (design/tokens.css) y regenerá. */
:root {
  color-scheme: ${defScheme};
${cssVars(k)}
  /* Roles (${defScheme === 'light' ? 'claro' : 'oscuro'}) */
${roleVars(def)}
}
${style.theme === 'claro' ? '/* Tema único claro (style.json: theme=claro). Los roles oscuros quedan en tokens.json por si se agregan. */' : `@media (prefers-color-scheme: ${altScheme}) {
  :root:not([data-theme="${defScheme}"]) {
    color-scheme: ${altScheme};
${roleVars(alt).replace(/^/gm, '  ')}
  }
}
:root[data-theme="${altScheme}"] {
  color-scheme: ${altScheme};
${roleVars(alt)}
}`}
@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; --stagger: 0ms; }
}
`;
}

function tailwindCss(k) {
  const L = ['/* Tailwind v4: importá este archivo desde tu CSS de entrada (después de @import "tailwindcss").', '   Los roles (bg, text, accent...) cambian con el tema porque apuntan a las variables de tokens.css. */', '@import "./tokens.css";', '', '@theme {'];
  for (const s of STEPS) L.push(`  --color-accent-${s}: ${k.A[s]};`);
  for (const s of STEPS) L.push(`  --color-neutral-${s}: ${k.N[s]};`);
  for (const [n, sc] of Object.entries(k.S)) for (const s of STEPS) L.push(`  --color-${n}-${s}: ${sc[s]};`);
  L.push(`  --font-display: ${k.fonts.display};`, `  --font-sans: ${k.fonts.body};`, `  --font-mono: ${k.fonts.mono};`);
  for (const t of k.type) L.push(`  --text-${t.name}: ${t.fluid || `${t.rem}rem`};`, `  --text-${t.name}--line-height: ${t.lh};`, `  --text-${t.name}--letter-spacing: ${t.ls};`);
  L.push(`  --spacing: ${+(4 * k.factor).toFixed(2)}px;`);
  for (const [n, v] of Object.entries(k.radii)) L.push(`  --radius-${n}: ${v}px;`);
  for (const [n, v] of Object.entries(k.shadows)) L.push(`  --shadow-${n}: ${v};`);
  L.push(`  --ease-out: ${k.motion.easeOut};`, `  --ease-in: ${k.motion.easeIn};`, `  --ease-in-out: ${k.motion.easeInOut};`, '}', '', '@theme inline {');
  for (const n of Object.keys(k.light)) L.push(`  --color-${n}: var(--${n});`);
  L.push('}', '');
  return L.join('\n');
}

function tokensJson(k, style, slug) {
  const col = (o) => Object.fromEntries(Object.entries(o).map(([s, v]) => [s, { $type: 'color', $value: v }]));
  return {
    $description: `Kit de la página ${slug} (front-studio page-kit). Formato Design Tokens (DTCG).`,
    color: { accent: col(k.A), neutral: col(k.N), ...Object.fromEntries(Object.entries(k.S).map(([n, sc]) => [n, col(sc)])) },
    role: { light: col(k.light), dark: col(k.dark) },
    font: { display: { $type: 'fontFamily', $value: k.fonts.display }, body: { $type: 'fontFamily', $value: k.fonts.body }, mono: { $type: 'fontFamily', $value: k.fonts.mono } },
    text: Object.fromEntries(k.type.map((t) => [t.name, { size: { $type: 'dimension', $value: `${t.rem}rem`, ...(t.fluid ? { $extensions: { 'front-studio': { fluid: t.fluid } } } : {}) }, lineHeight: { $type: 'number', $value: t.lh }, letterSpacing: { $type: 'dimension', $value: t.ls === '0' ? '0em' : t.ls } }])),
    space: Object.fromEntries(k.space.map((v, i) => [i, { $type: 'dimension', $value: `${v}px` }])),
    radius: Object.fromEntries(Object.entries(k.radii).map(([n, v]) => [n, { $type: 'dimension', $value: `${v}px` }])),
    shadow: Object.fromEntries(Object.entries(k.shadows).map(([n, v]) => [n, { $type: 'shadow', $value: v }])),
    duration: { fast: { $type: 'duration', $value: `${k.motion.fast}ms` }, base: { $type: 'duration', $value: `${k.motion.base}ms` }, slow: { $type: 'duration', $value: `${k.motion.slow}ms` } },
    easing: { out: { $type: 'cubicBezier', $value: [0.2, 0, 0, 1] }, in: { $type: 'cubicBezier', $value: [0.4, 0, 1, 1] }, inOut: { $type: 'cubicBezier', $value: [0.4, 0, 0.2, 1] } },
    $extensions: { 'front-studio': { style, ratio: k.ratio, base: k.base, anchor: k.anchor, anchorStep: k.anchorStep } },
  };
}

function kitMd(k, style, slug, brand) {
  const fails = k.pairs.filter((p) => !p.ok);
  const L = [`# Kit de la página: ${slug}`, '', `Superficie **${style.surface}** · variación ${style.variance} · movimiento ${style.motion} · densidad ${style.density} · ${style.temperature} · forma ${style.shape} · profundidad ${style.depth} · tipografía ${style.type} · acento ${style.accentUse} · tema ${style.theme}.`, '', `Archivos: \`tokens.css\` (variables), \`tokens.json\` (DTCG), \`tailwind.css\` (Tailwind v4), \`specimen.html\` (hoja de muestra: abrila en el navegador).`, ''];
  L.push('## Heredado de la marca', '', ...(k.notes.inherited.length ? k.notes.inherited.map((x) => `- ${x}`) : [brand ? '- Nada utilizable en la marca (sin variables de color o fuente reconocibles).' : '- No hay `design/tokens.css`: el kit no hereda nada.']), '');
  L.push('## Ajustado para esta página', '', ...k.notes.adjusted.map((x) => `- ${x}`), `- Escala tipográfica ${k.ratio} sobre base ${k.base}px; espaciado ×${k.factor}; radios "${style.shape}"; sombras "${style.depth}"; duraciones ${k.motion.fast}/${k.motion.base}/${k.motion.slow} ms.`, '');
  L.push('## Contraste verificado (WCAG 2.x)', '', `${fails.length ? `**${fails.length} par(es) no pasan.**` : 'Todos los pares obligatorios pasan.'}`, '', '| Tema | Par | Razón | Mínimo | |', '|---|---|---|---|---|');
  for (const p of k.pairs) L.push(`| ${p.theme === 'light' ? 'claro' : 'oscuro'} | ${p.name} | ${p.ratio}:1 | ${p.min}:1 (${p.kind}) | ${p.ok ? 'pasa' : '**NO**'} |`);
  L.push('', '## Tipografía', '', '| Paso | px (máx.) | rem | interlineado | fluido |', '|---|---|---|---|---|', ...k.type.map((t) => `| ${t.name} | ${t.px} | ${t.rem} | ${t.lh} | ${t.fluid ? 'sí (clamp 360→1280px)' : ''} |`), '', `Display: ${k.fonts.display}  `, `Cuerpo: ${k.fonts.body}  `, `Datos/código: ${k.fonts.mono}`, ...(k.googleUrl ? ['', `Google Fonts: \`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${k.googleUrl}">\``] : []), '');
  L.push('## Cómo usar', '', '- Componentes: usá los roles (`--bg`, `--surface`, `--text`, `--text-muted`, `--border`, `--accent`, `--on-accent`, `--focus`, `--success`...) y no los pasos de escala; así el tema oscuro funciona solo.', '- Radios por jerarquía: `--radius-control` (botones, campos), `--radius-card`, `--radius-panel` (modales, paneles).', `- Movimiento: \`transition: transform var(--dur-base) var(--ease-out)\`. ${k.motion.entrance ? 'Se permite un momento de entrada orquestado.' : 'Sin animaciones de entrada: solo respuesta a acciones.'} Reduced-motion ya anula las duraciones.`, '- Cifras: `font-variant-numeric: tabular-nums` en tablas y montos.', '', `Regenerar: \`node "\${CLAUDE_PLUGIN_ROOT}/skills/page-kit/scripts/page-kit.cjs" --page ${slug}\``, '');
  return L.join('\n');
}

function specimen(k, style, slug, css) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sw = (name, sc) => `<div class="ramp"><h3>${name}</h3><ol>${STEPS.map((s) => `<li style="background:${sc[s]};color:${C.contrast(sc[s], '#ffffff') >= 4.5 ? '#fff' : '#111'}"><span>${s}</span><code>${sc[s]}</code></li>`).join('')}</ol></div>`;
  const rows = k.pairs.map((p) => `<tr class="${p.ok ? '' : 'bad'}"><td>${p.theme === 'light' ? 'claro' : 'oscuro'}</td><td>${esc(p.name)}</td><td class="num"><span class="chip" style="background:${p.bg};color:${p.fg}">Aa</span> ${p.ratio}:1</td><td class="num">${p.min}:1</td><td>${p.ok ? 'pasa' : 'NO'}</td></tr>`).join('');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kit ${esc(slug)}</title>
${k.googleUrl ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${k.googleUrl}">` : ''}
<style>
${css}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: var(--text-base)/var(--lh-base) var(--font-body); }
.wrap { max-width: 1120px; margin: 0 auto; padding-inline: max(16px, var(--space-6)); padding-block: var(--space-8); display: grid; gap: var(--space-10); }
header { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: end; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: var(--space-6); }
h1, h2, h3 { font-family: var(--font-display); margin: 0; text-wrap: balance; }
h1 { font-size: var(--text-3xl); line-height: var(--lh-3xl); letter-spacing: var(--ls-3xl); }
h2 { font-size: var(--text-xl); line-height: var(--lh-xl); margin-bottom: var(--space-4); }
h3 { font-size: var(--text-sm); color: var(--text-muted); font-weight: 600; margin-bottom: var(--space-2); }
p.meta { color: var(--text-muted); margin: var(--space-2) 0 0; max-width: 65ch; }
.btn { font: inherit; font-weight: 600; border-radius: var(--radius-control); padding: var(--space-2) var(--space-4); border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); cursor: pointer; transition: background var(--dur-fast) var(--ease-out); }
.btn.primary { background: var(--accent); color: var(--on-accent); border-color: transparent; }
.btn:focus-visible, input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.ramps { display: grid; gap: var(--space-4); }
.ramp ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); border-radius: var(--radius-card); overflow: hidden; }
.ramp li { padding: var(--space-3) var(--space-1); min-height: 64px; display: grid; align-content: space-between; font-size: var(--text-xs); }
.ramp code { font-family: var(--font-mono); font-size: 0.75rem; word-break: break-all; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: var(--text-sm); }
th, td { text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); }
th { color: var(--text-muted); font-weight: 600; }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
tr.bad td { color: var(--danger); font-weight: 600; }
.chip { display: inline-block; padding: 0 var(--space-2); border-radius: var(--radius-xs); border: 1px solid var(--border); }
.type-row { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: var(--space-4); align-items: baseline; padding-block: var(--space-2); border-bottom: 1px solid var(--border); }
.type-row small { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.type-row div { min-width: 0; overflow-wrap: anywhere; }
@media (max-width: 640px) { .type-row { grid-template-columns: minmax(0, 1fr); gap: var(--space-1); } .ramp ol { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.space-row { display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-sm); }
.space-row i { display: block; height: 12px; background: var(--accent-soft); border: 1px solid var(--accent); }
.boxes { display: flex; flex-wrap: wrap; gap: var(--space-4); }
.box { width: 120px; height: 80px; background: var(--surface); border: 1px solid var(--border); display: grid; place-items: center; font-size: var(--text-sm); color: var(--text-muted); }
.demo { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-panel); padding: var(--space-5); display: grid; gap: var(--space-3); min-width: 0; }
label { font-size: var(--text-sm); font-weight: 600; }
input { font: inherit; padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); width: 100%; }
.alert { border-radius: var(--radius-card); padding: var(--space-3) var(--space-4); font-size: var(--text-sm); }
.slide { transform: translateX(0); transition: transform var(--dur-slow) var(--ease-out), opacity var(--dur-base) var(--ease-out); }
.slide.out { transform: translateX(24px); opacity: 0; }
</style>
</head>
<body>
<main class="wrap">
<header>
  <div><h1>Kit: ${esc(slug)}</h1>
  <p class="meta">Superficie ${style.surface}, densidad ${style.density}, variación ${style.variance}, movimiento ${style.motion}; escala ${k.ratio} sobre ${k.base}px. Generado por page-kit: los ratios de contraste están calculados, no estimados.</p></div>
  <button class="btn" id="theme" type="button">Cambiar tema</button>
</header>
<section><h2>Color</h2><!-- ai-look:ignore --><div class="ramps">${sw('Acento', k.A)}${sw('Neutros', k.N)}${Object.entries(k.S).map(([n, sc]) => sw({ success: 'Éxito', warning: 'Advertencia', danger: 'Error', info: 'Información' }[n], sc)).join('')}</div><!-- /ai-look:ignore --></section>
<section><h2>Contraste de los roles</h2><div class="scroll"><table><thead><tr><th>Tema</th><th>Par</th><th>Razón</th><th>Mínimo</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section><h2>Tipografía</h2>${[...k.type].reverse().map((t) => `<div class="type-row"><small>${t.name}, ${t.px}px</small><div style="font-size:var(--text-${t.name});line-height:var(--lh-${t.name});letter-spacing:var(--ls-${t.name});font-family:${t.px >= 24 ? 'var(--font-display)' : 'var(--font-body)'}">Cierre de mes: 1.284 registros conciliados</div></div>`).join('')}</section>
<section><h2>Espaciado</h2>${k.space.map((v, i) => `<div class="space-row"><span class="num" style="width:4rem">space-${i}</span><i style="width:${v}px"></i><span class="num">${v}px</span></div>`).join('')}</section>
<section><h2>Radios y profundidad</h2><div class="boxes">${['xs', 'sm', 'md', 'lg'].map((r) => `<div class="box" style="border-radius:var(--radius-${r})">${r}: ${k.radii[r]}px</div>`).join('')}${['1', '2', 'overlay'].map((s) => `<div class="box" style="box-shadow:var(--shadow-${s});border-radius:var(--radius-card)">sombra ${s}</div>`).join('')}</div></section>
<section><h2>Componentes de muestra</h2><div class="demo">
  <div class="panel"><label for="m">Monto a conciliar</label><input id="m" inputmode="decimal" value="12.480,00"><div style="display:flex;gap:var(--space-2);flex-wrap:wrap"><button class="btn primary" type="button">Guardar cambios</button><button class="btn" type="button">Cancelar</button></div></div>
  <div class="panel">${Object.keys(SEM).map((n) => `<div class="alert" style="background:var(--${n}-soft);color:var(--${n})">${{ success: 'Conciliación guardada.', warning: 'Datos de hace 3 horas: actualizá antes de cerrar.', danger: 'No se pudo guardar: falta la fecha de corte.', info: 'Hay 4 movimientos nuevos desde ayer.' }[n]}</div>`).join('')}</div>
  <div class="panel"><div class="scroll"><table><thead><tr><th>Cuenta</th><th class="num">Saldo</th></tr></thead><tbody><tr><td>Operativa</td><td class="num">1.204.330,10</td></tr><tr><td>Reserva</td><td class="num">88.019,00</td></tr></tbody></table></div><a href="#theme" style="color:var(--accent-text)">Ver movimientos de la cuenta</a></div>
  <div class="panel"><p style="margin:0;color:var(--text-muted)">Movimiento: ${k.motion.fast} / ${k.motion.base} / ${k.motion.slow} ms.</p><button class="btn" id="play" type="button">Probar transición</button><div class="slide" id="slab" style="padding:var(--space-3);background:var(--accent-soft);color:var(--accent-soft-text);border-radius:var(--radius-card)">Panel de detalle</div></div>
</div></section>
</main>
<script>
document.getElementById('theme').addEventListener('click', function () {
  var r = document.documentElement, dark = r.getAttribute('data-theme') ? r.getAttribute('data-theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.setAttribute('data-theme', dark ? 'light' : 'dark');
});
document.getElementById('play').addEventListener('click', function () { document.getElementById('slab').classList.toggle('out'); });
</script>
</body>
</html>
`;
}

function main() {
  const argv = process.argv.slice(2);
  const slug = arg(argv, '--page');
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) { console.error('Uso: node page-kit.cjs --page <slug-en-minúsculas> [--style design/style.json] [--brand design/tokens.css] [--accent #RRGGBB] [--out design/pages] [--json]'); process.exit(2); }
  const styleFile = arg(argv, '--style') || 'design/style.json';
  let raw = {};
  if (fs.existsSync(styleFile)) { try { raw = JSON.parse(fs.readFileSync(styleFile, 'utf8')); } catch (e) { console.error(`${styleFile}: ${e.message}`); process.exit(2); } }
  else if (arg(argv, '--style')) { console.error(`No existe ${styleFile}`); process.exit(2); }
  const { style, errors, warnings } = normalize(raw);
  if (errors.length) { errors.forEach((e) => console.error(`ERROR ${e}`)); process.exit(2); }
  const accent = arg(argv, '--accent');
  if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) { console.error('--accent tiene que ser #RRGGBB'); process.exit(2); }
  const brand = argv.includes('--no-brand') ? null : parseBrand(arg(argv, '--brand') || 'design/tokens.css');
  const k = build(style, brand, accent);
  if (!fs.existsSync(styleFile)) k.notes.adjusted.unshift(`Sin ${styleFile}: se usó el preset de "${style.surface}". Corré style-quiz para ajustarlo.`);
  for (const w of warnings) k.notes.adjusted.push(`Aviso: ${w}`);
  const outDir = path.join(arg(argv, '--out') || path.join('design', 'pages'), slug);
  fs.mkdirSync(outDir, { recursive: true });
  const css = tokensCss(k, style, slug);
  fs.writeFileSync(path.join(outDir, 'tokens.css'), css);
  fs.writeFileSync(path.join(outDir, 'tailwind.css'), tailwindCss(k));
  fs.writeFileSync(path.join(outDir, 'tokens.json'), JSON.stringify(tokensJson(k, style, slug), null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'kit.md'), kitMd(k, style, slug, brand));
  fs.writeFileSync(path.join(outDir, 'specimen.html'), specimen(k, style, slug, css));
  const fails = k.pairs.filter((p) => !p.ok);
  if (argv.includes('--json')) console.log(JSON.stringify({ out: outDir, anchor: k.anchor, ratio: k.ratio, base: k.base, pairs: k.pairs, fails: fails.length, notes: k.notes }, null, 2));
  else {
    console.log(`Kit "${slug}" en ${outDir}: tokens.css, tokens.json, tailwind.css, specimen.html, kit.md`);
    console.log(`  Acento ${k.anchor} (paso ${k.anchorStep}) · escala ${k.ratio} sobre ${k.base}px · espaciado ×${k.factor} · ${k.pairs.length} pares de contraste verificados, ${fails.length} fallan`);
    for (const n of k.notes.inherited) console.log(`  Hereda: ${n}`);
    for (const n of k.notes.adjusted) console.log(`  Ajusta: ${n}`);
    for (const f of fails) console.log(`  NO PASA ${f.theme} ${f.name}: ${f.ratio}:1 (mínimo ${f.min})`);
  }
  process.exit(fails.length ? 1 : 0);
}

if (require.main === module) main();
module.exports = { build, scale, parseBrand };
