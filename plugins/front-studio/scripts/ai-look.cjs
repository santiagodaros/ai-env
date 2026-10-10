#!/usr/bin/env node
// Detector determinista de "look de IA": busca en HTML/CSS/JSX las decisiones por defecto que delatan una UI generada.
// Uso: node ai-look.cjs <archivo|carpeta>... [--json] [--out archivo.json] [--allow id,id] [--max N]
// Un tic no es un error: si la dirección lo eligió a propósito, pasalo en --allow y deja de contar.
// Salida: índice 0-100 (más alto = más genérico) y la lista de tics con evidencia archivo:línea.
// Con --max N sale con 1 si el índice supera N (para usarlo como compuerta).
'use strict';
const C = require('../lib/color.cjs');
const { collect, matches, where, args, finding, writeJson } = require('../lib/scan.cjs');

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)/g;
const BG_CTX_RE = /(?:background(?:-color)?\s*:\s*|bg-\[|--(?:bg|background|surface|paper|page|canvas|base)[\w-]*\s*:\s*)([^;}\]\n]+)/gi;

const lch = (s) => { const rgb = C.parse(s); return rgb ? { rgb, ...C.rgbToOklch(rgb) } : null; };
// Los pasos numerados de una escala (--warning-50: …) son datos de paleta, no decisiones de uso: no cuentan.
const isScaleStep = (src, index) => /--[\w-]*-\d{2,3}\s*:\s*$/.test(src.text.slice(src.text.lastIndexOf('\n', index) + 1, index));
function colorsIn(src, re = COLOR_RE) {
  const out = [];
  for (const h of matches(src, re)) { if (isScaleStep(src, h.m.index)) continue; const c = lch(h.m[0]); if (c) out.push({ ...h, c }); }
  return out;
}
function bgColors(src) {
  const out = [];
  for (const h of matches(src, BG_CTX_RE)) {
    for (const m of h.m[1].matchAll(COLOR_RE)) { const c = lch(m[0]); if (c) out.push({ ...h, c }); }
  }
  return out;
}
const hueIn = (h, a, b) => (a <= b ? h >= a && h <= b : h >= a || h <= b);

// Cada regla: id, peso, título, por qué, qué hacer, y test(srcs) → lista de evidencias (vacía = no aparece).
const RULES = [
  {
    id: 'paleta-crema-terracota', weight: 3, title: 'Fondo crema con acento terracota',
    fix: 'Partí de la paleta de la marca o de un color ancla del dominio; el crema + terracota es el default más repetido de las UIs generadas.',
    test: (S) => {
      const cream = S.flatMap((s) => colorsIn(s)).filter((x) => C.distance(x.c.rgb, [0xf4, 0xf1, 0xea]) < 0.035);
      const terra = S.flatMap((s) => colorsIn(s)).filter((x) => C.distance(x.c.rgb, [0xd9, 0x77, 0x57]) < 0.06);
      return cream.length && terra.length ? [...cream.slice(0, 2), ...terra.slice(0, 2)] : [];
    },
  },
  {
    id: 'negro-acido', weight: 3, title: 'Fondo casi negro con un único acento ácido',
    fix: 'Si el producto pide oscuro, construí la escala desde la marca y usá el acento solo donde guía una acción o un estado.',
    test: (S) => {
      const dark = S.flatMap(bgColors).filter((x) => x.c.l < 0.2 && x.c.c < 0.03);
      const dkTw = S.flatMap((s) => matches(s, /\bbg-(?:black|(?:zinc|neutral|stone|gray|slate)-9[05]0)\b/));
      const acid = S.flatMap((s) => colorsIn(s)).filter((x) => x.c.c > 0.17 && x.c.l > 0.55 && (hueIn(x.c.h, 115, 160) || hueIn(x.c.h, 25, 45)));
      const acTw = S.flatMap((s) => matches(s, /\b(?:text|bg|border)-(?:lime|green|emerald)-[34]00\b/));
      return (dark.length || dkTw.length) && (acid.length || acTw.length) ? [...dark, ...dkTw].slice(0, 2).concat([...acid, ...acTw].slice(0, 2)) : [];
    },
  },
  {
    id: 'degrade-violeta', weight: 2, title: 'Degradé violeta-azul como decoración',
    fix: 'Sacá el degradé o usalo solo si representa algo (una escala, un rango). Fondo plano de la paleta.',
    test: (S) => {
      const css = S.flatMap((s) => matches(s, /(?:linear|radial|conic)-gradient\([^;]*\)/)).filter((h) => {
        const hs = [...h.m[0].matchAll(COLOR_RE)].map((m) => lch(m[0])).filter((c) => c && c.c > 0.08).map((c) => c.h);
        return hs.some((h) => hueIn(h, 280, 335)) && hs.some((h) => hueIn(h, 230, 280));
      });
      const tw = S.flatMap((s) => matches(s, /\bfrom-(?:purple|violet|indigo|fuchsia)-\d{3}\b[^"'`]*\bto-(?:blue|indigo|purple|pink|violet|cyan)-\d{3}\b/));
      return [...css, ...tw];
    },
  },
  {
    id: 'texto-degrade', weight: 2, title: 'Texto con degradé',
    fix: 'Color sólido para el texto; si un título necesita fuerza, que la dé la tipografía (peso, tamaño, familia).',
    test: (S) => S.flatMap((s) => matches(s, /background-clip\s*:\s*text|\bbg-clip-text\b/)),
  },
  {
    id: 'radio-unico', weight: 2, title: 'El mismo radio en todo',
    fix: 'Radios por jerarquía: controles chicos, tarjetas medianos, paneles o modales mayores (o rectos si la dirección lo pide).',
    test: (S) => {
      const vals = [];
      for (const s of S) {
        for (const h of matches(s, /border-radius\s*:\s*([^;}\n]+)/)) vals.push({ ...h, v: h.m[1].trim() });
        for (const h of matches(s, /\brounded(?:-(?:sm|md|lg|xl|2xl|3xl|full|none|\[[^\]]+\]))?\b(?![-\w])/)) vals.push({ ...h, v: h.m[0] });
      }
      const real = vals.filter((x) => !/^(?:0|0px|none|rounded-none|9999px|50%|rounded-full|inherit)$/.test(x.v));
      if (real.length < 8) return [];
      const freq = {}; for (const x of real) freq[x.v] = (freq[x.v] || 0) + 1;
      const [top, n] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
      return n / real.length >= 0.8 ? real.filter((x) => x.v === top).map((x) => ({ ...x, note: `${top} en ${n} de ${real.length}` })) : [];
    },
  },
  {
    id: 'sombra-gris-suave', weight: 2, title: 'La misma sombra gris suave debajo de cada bloque',
    fix: 'Sombra solo para lo que flota (menús, modales); el resto se separa con espacio, borde o fondo.',
    test: (S) => {
      const css = S.flatMap((s) => matches(s, /box-shadow\s*:[^;}\n]*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.(?:0[4-9]|1[0-5]?)\s*\)/));
      const tw = S.flatMap((s) => matches(s, /(?<![-\w:])shadow(?:-(?:sm|md|lg))?(?![-\w])/));
      return css.length + tw.length >= 6 ? [...css, ...tw] : [];
    },
  },
  {
    id: 'eyebrow-mayusculas', weight: 2, title: 'Rótulo en mayúsculas espaciadas sobre cada título',
    fix: 'Rótulos solo cuando agregan información; en minúscula y sin tracking si no son siglas.',
    test: (S) => {
      const css = S.flatMap((s) => matches(s, /\{[^{}]*text-transform\s*:\s*uppercase[^{}]*letter-spacing[^{}]*\}|\{[^{}]*letter-spacing[^{}]*text-transform\s*:\s*uppercase[^{}]*\}/));
      const tw = S.flatMap((s) => matches(s, /\buppercase\b[^"'`]*\btracking-(?:wide|wider|widest|\[)|\btracking-(?:wide|wider|widest|\[)[^"'`]*\buppercase\b/));
      return css.length + tw.length >= 3 ? [...css, ...tw] : [];
    },
  },
  {
    id: 'flecha-enlace', weight: 1, title: 'Flecha "→" al final de enlaces y botones',
    fix: 'El texto del enlace dice adónde lleva; la flecha solo si indica dirección real (siguiente paso de un asistente).',
    test: (S) => { const h = S.flatMap((s) => matches(s, /(?:→|&rarr;|&#8594;)\s*<\/(?:a|button|Link|span)>|[\w)]\s+(?:→|&rarr;)\s*["'`<]/)); return h.length >= 2 ? h : []; },
  },
  {
    id: 'punto-medio', weight: 1, title: 'Metadatos unidos con punto medio ("A · B · C")',
    fix: 'Si los datos son distintos, que tengan su lugar (columnas, etiquetas); el punto medio en todo es plantilla.',
    test: (S) => { const h = S.flatMap((s) => matches(s, / (?:·|&middot;|&#183;) /)); return h.length >= 3 ? h : []; },
  },
  {
    id: 'raya-etiqueta', weight: 1, title: 'Etiquetas "PALABRA — fragmento" con raya',
    fix: 'Escribí una frase o una etiqueta; la raya decorativa repetida es un tic.',
    test: (S) => { const h = S.flatMap((s) => matches(s, />[^<>]{0,20}\b[A-ZÁÉÍÓÚ][\wáéíóúñ]+ — [a-záéíóúñ][^<>]{0,60}</)); return h.length >= 2 ? h : []; },
  },
  {
    id: 'emoji-icono', weight: 2, title: 'Emojis como íconos o en la interfaz',
    fix: 'Íconos de un set coherente con nombre accesible, o nada. Los emojis cambian según el sistema operativo.',
    test: (S) => {
      const ui = S.flatMap((s) => matches(s, /<(?:h[1-6]|button|li|a|label|th|td|span|p)\b[^>]*>[^<]{0,40}\p{Extended_Pictographic}/u));
      const all = S.flatMap((s) => matches(s, /\p{Extended_Pictographic}\uFE0F?/u)).filter((h) => !/[©®™]/.test(h.m[0]));
      return ui.length || all.length >= 3 ? (ui.length ? ui : all) : [];
    },
  },
  {
    id: 'vidrio', weight: 2, title: 'Desenfoque tipo vidrio en varios lugares',
    fix: 'Superficies opacas con la escala neutra; el blur cuesta rendimiento y baja el contraste del texto encima.',
    test: (S) => { const h = S.flatMap((s) => matches(s, /backdrop-filter\s*:\s*[^;}\n]*blur|\bbackdrop-blur(?:-\w+)?\b/)); return h.length >= 2 ? h : []; },
  },
  {
    id: 'entrada-fade-up', weight: 2, title: 'Cada sección entra desvaneciendo y subiendo',
    fix: 'Un solo momento orquestado (o ninguno). El movimiento responde a una acción o explica un cambio.',
    test: (S) => {
      const kf = S.flatMap((s) => matches(s, /@keyframes\s+[\w-]+\s*\{[^@]*?opacity\s*:\s*0[^@]*?translate(?:Y|3d)?\(\s*(?:0\s*,\s*)?[1-9]/));
      const cls = S.flatMap((s) => matches(s, /\b(?:animate-fade-?(?:in-)?up|fade-?in-?up|fadeInUp|data-aos=["']fade-up)\b|initial=\{\{\s*opacity:\s*0,\s*y:\s*[1-9]/));
      return kf.length + cls.length >= 2 || (kf.length && S.some((s) => (s.text.match(/animation\s*:/g) || []).length >= 3)) ? [...kf, ...cls] : [];
    },
  },
  {
    id: 'hover-elevacion', weight: 1, title: 'Tarjetas que se elevan al pasar el mouse',
    fix: 'Realimentación de hover discreta (fondo, borde) solo en lo que es clickeable.',
    test: (S) => { const h = S.flatMap((s) => matches(s, /:hover\s*\{[^}]*translateY\(\s*-|\bhover:-translate-y-\d|whileHover=\{\{[^}]*y:\s*-/)); return h.length >= 2 ? h : []; },
  },
  {
    id: 'copy-de-venta', weight: 2, title: 'Texto de venta genérico en la interfaz',
    fix: 'Copy de interfaz: verbos claros que dicen qué pasa ("Guardar cambios"), sin promesas ni saludos.',
    test: (S) => S.flatMap((s) => matches(s, /\b(?:potenci[aá]\s+tu|llev[aá] tu [\wáé]+ al siguiente nivel|revolucion[ae]|sin esfuerzo|todo en un solo lugar|hola de nuevo|supercharge|unlock (?:the|your)|seamless(?:ly)?|elevate your|empower(?:s|ing)? (?:your|teams)|next-level|game[- ]changer|all-in-one platform|welcome back|lorem ipsum)\b/i)),
  },
  {
    id: 'fuente-por-defecto', weight: 1, title: 'La fuente principal es la de siempre',
    fix: 'Elegí la tipografía por el carácter del producto (o la de la marca). Inter/Roboto en todo es la elección por omisión.',
    test: (S) => {
      const fams = S.flatMap((s) => matches(s, /font-family\s*:\s*["']?([\w ]+)/)).map((h) => ({ ...h, f: h.m[1].trim().toLowerCase() })).filter((h) => !/^(?:inherit|var|monospace|ui-monospace|sans-serif|serif)$/.test(h.f));
      const gf = S.flatMap((s) => matches(s, /fonts\.googleapis\.com\/css2?\?family=([\w+]+)/)).map((h) => ({ ...h, f: h.m[1].replace(/\+/g, ' ').toLowerCase() }));
      const all = [...fams, ...gf];
      const DEF = /^(?:inter|roboto|open sans|poppins|montserrat|system-ui|-apple-system|arial|helvetica)$/;
      return all.length && all.every((h) => DEF.test(h.f)) ? all : [];
    },
  },
  {
    id: 'negro-tintado', weight: 1, title: 'Casi negro de plantilla (#0B0B0B, #111, #121212)',
    fix: 'Definí el oscuro desde la escala neutra de la paleta (con el tono de la marca), no un gris de plantilla.',
    test: (S) => { const h = S.flatMap((s) => matches(s, /#(?:0a0a0a|0b0b0b|0c0c0c|111111|111|121212|0f0f0f)\b/i)); return h.length >= 2 ? h : []; },
  },
  {
    id: 'mono-etiquetas', weight: 1, title: 'Monoespaciada para cualquier dato chico',
    fix: 'Monoespaciada solo para código o identificadores; para números que se comparan, cifras tabulares de la fuente del cuerpo.',
    test: (S) => { const h = S.flatMap((s) => matches(s, /font-family\s*:\s*[^;}\n]*monospace|\bfont-mono\b/)); return h.length >= 4 ? h : []; },
  },
  {
    id: 'fila-kpi', weight: 1, title: 'Fila de cuatro tarjetas de métricas arriba de todo',
    fix: 'Arrancá por la pregunta de la pantalla ("qué cambió, qué requiere acción"); las métricas van donde respondan eso.',
    test: (S) => S.flatMap((s) => matches(s, /(?:grid-cols-4|repeat\(\s*4\s*,)[\s\S]{0,400}?\b(?:kpi|stat|metric)/i)),
  },
  {
    id: 'manchas-blur', weight: 1, title: 'Manchas de color desenfocadas de fondo',
    fix: 'Sacalas. Si el fondo necesita carácter, que salga del dominio (una textura, una retícula con sentido).',
    test: (S) => S.flatMap((s) => matches(s, /filter\s*:\s*blur\(\s*(?:[4-9]\d|\d{3,})px|\bblur-(?:3xl|\[\d{2,}px\])\b/)),
  },
  {
    id: 'numeracion-decorativa', weight: 1, title: 'Numeración 01 / 02 / 03 en contenido que no es una secuencia',
    fix: 'Numerá solo pasos o tiempos reales.',
    test: (S) => { const h = S.flatMap((s) => matches(s, />\s*0[1-9]\s*[./]?\s*</)); return h.length >= 3 ? h : []; },
  },
];

const MAX_REF = 20; // suma de pesos que se considera "totalmente genérico"

// Bloques que muestran colores como dato (muestrarios, documentación) se excluyen marcándolos:
// <!-- ai-look:ignore --> … <!-- /ai-look:ignore -->  o  /* ai-look:ignore */ … /* /ai-look:ignore */
const IGNORE_RE = /(?:<!--|\/\*)\s*ai-look:ignore\s*(?:-->|\*\/)[\s\S]*?(?:<!--|\/\*)\s*\/ai-look:ignore\s*(?:-->|\*\/)/g;

function analyze(inputs, allow = []) {
  const srcs = collect(inputs).map((s) => ({ ...s, text: s.text.replace(IGNORE_RE, (m) => m.replace(/[^\n]/g, '')) }));
  const tells = [];
  for (const r of RULES) {
    if (allow.includes(r.id)) continue;
    const hits = r.test(srcs);
    if (hits.length) tells.push({ id: r.id, weight: r.weight, title: r.title, fix: r.fix, count: hits.length, where: where(hits), note: hits.find((h) => h.note)?.note || '' });
  }
  const sum = tells.reduce((a, t) => a + t.weight, 0);
  const score = Math.min(100, Math.round((sum / MAX_REF) * 100));
  const level = score <= 15 ? 'sin señales fuertes' : score <= 40 ? 'algunos tics' : 'look genérico';
  const findings = tells.map((t) => finding({ source: 'ai-look', id: t.id, title: t.title, severity: t.weight >= 3 ? 'P1' : 'P2', where: t.where, evidence: `${t.count} aparición(es)${t.note ? `; ${t.note}` : ''}`, fix: t.fix, effort: t.weight >= 2 ? 'M' : 'S' }));
  return { tool: 'ai-look', files: srcs.length, score, max: 100, level, allowed: allow, tells, findings };
}

if (require.main === module) {
  const { pos, opt } = args(process.argv.slice(2), ['json']);
  if (!pos.length) { console.error('Uso: node ai-look.cjs <archivo|carpeta>... [--json] [--out f.json] [--allow id,id] [--max N]'); process.exit(2); }
  let res;
  try { res = analyze(pos, (opt.allow || '').split(',').map((x) => x.trim()).filter(Boolean)); } catch (e) { console.error(e.message); process.exit(2); }
  if (opt.out) writeJson(opt.out, res);
  if (opt.json) console.log(JSON.stringify(res, null, 2));
  else {
    console.log(`Look de IA: ${res.score}/100 (${res.level}) en ${res.files} archivo(s)${res.allowed.length ? `; permitidos por la dirección: ${res.allowed.join(', ')}` : ''}`);
    for (const t of res.tells) console.log(`- [${t.weight}] ${t.id}: ${t.title} — ${t.where}${t.note ? ` (${t.note})` : ''}\n    Qué hacer: ${t.fix}`);
    if (!res.tells.length) console.log('No aparece ningún tic de la lista. Esto no prueba que el diseño sea bueno: solo que no cae en los defaults detectables.');
  }
  process.exit(opt.max !== undefined && res.score > Number(opt.max) ? 1 : 0);
}

module.exports = { analyze, RULES };
