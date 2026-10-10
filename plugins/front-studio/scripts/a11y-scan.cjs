#!/usr/bin/env node
// Revisión estática de accesibilidad (WCAG 2.2) sobre HTML, JSX/TSX, Vue, Svelte y CSS. Sin dependencias.
// Uso: node a11y-scan.cjs <archivo|carpeta>... [--json] [--out archivo.json] [--max-p0 N]
// Detecta lo que se puede ver en el código: nombres accesibles, etiquetas, idioma, foco, zoom, contraste declarado,
// movimiento, encabezados, ids repetidos. NO reemplaza probar con teclado y lector de pantalla: lo dice en la salida.
// Puntaje 0-100. Sale con 1 si hay más P0 que --max-p0 (por defecto no corta).
'use strict';
const C = require('../lib/color.cjs');
const { collect, matches, lineAt, where, args, finding, writeJson } = require('../lib/scan.cjs');

const MARKUP = /\.(html?|jsx|tsx|vue|svelte|astro|mdx)$/i;
const STYLE = /\.(css|scss|sass|less|html?|vue|svelte|astro)$/i;
const attr = (tag, name) => new RegExp(`\\s${name}\\s*=`, 'i').test(tag);
const attrVal = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{["'\`]([^"'\`]*)["'\`]\\})`, 'i')); return m ? (m[1] ?? m[2] ?? m[3]) : null; };
const named = (tag) => attr(tag, 'aria-label') || attr(tag, 'aria-labelledby') || attr(tag, 'title');
const textOf = (inner) => inner.replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/&nbsp;/g, ' ').trim();
const hasSrOnlyText = (inner) => /class(?:Name)?=["'][^"']*\b(?:sr-only|visually-hidden)\b/.test(inner) || /<img[^>]+alt=["'][^"']+["']/i.test(inner) || /<svg[^>]*aria-label=/i.test(inner) || /<title>[^<]+<\/title>/i.test(inner);

// Resuelve var(--x) contra las custom properties de :root (un nivel de fallback).
function rootVars(srcs) {
  const vars = {};
  for (const s of srcs) for (const b of s.text.matchAll(/:root\s*\{([^}]*)\}/g)) for (const d of b[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) if (!(d[1] in vars)) vars[d[1]] = d[2].trim();
  return vars;
}
function resolve(v, vars, depth = 0) {
  if (!v || depth > 5) return null;
  const m = v.match(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/);
  if (m) return resolve(vars[m[1]] ?? m[2], vars, depth + 1);
  const c = v.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|\b(?:white|black)\b/);
  if (!c) return null;
  if (/rgba?\([^)]*,\s*0?\.\d+\s*\)|\/\s*0?\.\d+/.test(c[0])) return null; // con transparencia no se puede calcular sin el fondo real
  return C.parse(c[0]) ? c[0] : null;
}

const RULES = {
  'html-lang': { sev: 'P0', wcag: '3.1.1', title: 'El documento no declara el idioma', fix: 'Agregá lang="es" (o el idioma real) en <html>.', effort: 'S' },
  'img-alt': { sev: 'P0', wcag: '1.1.1', title: 'Imagen sin texto alternativo', fix: 'alt con lo que la imagen comunica; alt="" si es decorativa.', effort: 'S' },
  'boton-sin-nombre': { sev: 'P0', wcag: '4.1.2', title: 'Botón sin nombre accesible', fix: 'Texto visible, o aria-label que diga la acción ("Cerrar panel").', effort: 'S' },
  'enlace-sin-nombre': { sev: 'P0', wcag: '2.4.4', title: 'Enlace sin texto', fix: 'Texto que diga adónde lleva, o aria-label.', effort: 'S' },
  'control-sin-etiqueta': { sev: 'P0', wcag: '1.3.1 / 3.3.2', title: 'Campo de formulario sin etiqueta', fix: '<label for="id"> visible (el placeholder no es etiqueta), o aria-labelledby.', effort: 'S' },
  'click-sin-teclado': { sev: 'P0', wcag: '2.1.1', title: 'Elemento no interactivo con clic', fix: 'Usá <button> o <a href>; si no se puede, role, tabIndex={0} y manejo de Enter/Espacio.', effort: 'S' },
  'foco-oculto': { sev: 'P0', wcag: '2.4.7', title: 'Se quita el contorno de foco sin reemplazo', fix: 'Estilo :focus-visible con contraste ≥3:1 (outline de 2px con offset).', effort: 'S' },
  'zoom-bloqueado': { sev: 'P0', wcag: '1.4.4', title: 'El viewport impide hacer zoom', fix: 'Quitá user-scalable=no y maximum-scale=1 del meta viewport.', effort: 'S' },
  'aria-hidden-enfocable': { sev: 'P0', wcag: '4.1.2', title: 'Elemento enfocable dentro de aria-hidden', fix: 'Sacá aria-hidden o el foco (tabindex="-1" / inert).', effort: 'S' },
  'contraste': { sev: 'P0', wcag: '1.4.3', title: 'Contraste de texto insuficiente', fix: 'Llevá el par a ≥4,5:1 (≥3:1 en texto grande). Verificá con contrast.cjs.', effort: 'S' },
  'contraste-ui': { sev: 'P1', wcag: '1.4.11', title: 'Borde de control con contraste menor a 3:1', fix: 'Borde de campos y controles con ≥3:1 contra el fondo.', effort: 'S' },
  'sin-main': { sev: 'P1', wcag: '1.3.1 / 2.4.1', title: 'Sin región principal (<main>)', fix: 'Envolvé el contenido en <main> y la navegación en <nav>; agregá un enlace "Saltar al contenido".', effort: 'S' },
  'encabezados': { sev: 'P1', wcag: '1.3.1', title: 'Jerarquía de encabezados rota', fix: 'Un h1 por página y sin saltos de nivel (h2 → h4).', effort: 'S' },
  'tabindex-positivo': { sev: 'P1', wcag: '2.4.3', title: 'tabindex positivo', fix: 'Usá 0 o -1; el orden lo da el DOM.', effort: 'S' },
  'ids-duplicados': { sev: 'P1', wcag: '4.1.1 / 1.3.1', title: 'ids repetidos', fix: 'ids únicos: las etiquetas y aria-* apuntan al primero y rompen los demás.', effort: 'S' },
  'sin-reduced-motion': { sev: 'P1', wcag: '2.3.3', title: 'Hay animaciones y no se respeta prefers-reduced-motion', fix: '@media (prefers-reduced-motion: reduce) que anule o acorte animaciones y transiciones.', effort: 'S' },
  'autoplay': { sev: 'P1', wcag: '1.4.2 / 2.2.2', title: 'Video o audio con reproducción automática', fix: 'Sin autoplay, o muted con control de pausa visible.', effort: 'S' },
  'tabla-sin-encabezados': { sev: 'P1', wcag: '1.3.1', title: 'Tabla sin celdas de encabezado', fix: '<th scope="col"> en la fila de encabezado (y <caption> si ayuda).', effort: 'S' },
  'iframe-sin-titulo': { sev: 'P1', wcag: '4.1.2', title: 'iframe sin title', fix: 'title que describa el contenido incrustado.', effort: 'S' },
  'texto-chico': { sev: 'P2', wcag: '1.4.4', title: 'Texto menor a 12px', fix: 'Mínimo 12px para texto auxiliar; el cuerpo en 14-16px.', effort: 'S' },
  'sin-skip-link': { sev: 'P2', wcag: '2.4.1', title: 'Sin enlace para saltar la navegación', fix: 'Primer elemento enfocable: <a href="#main" class="skip">Saltar al contenido</a>.', effort: 'S' },
};

function scan(inputs) {
  const srcs = collect(inputs);
  const hits = {}; // id -> [{file,line,note}]
  const hit = (id, file, line, note = '') => { const l = (hits[id] = hits[id] || []); if (!l.some((x) => x.file === file && x.line === line)) l.push({ file, line, note }); };
  const markup = srcs.filter((s) => MARKUP.test(s.file));
  const styles = srcs.filter((s) => STYLE.test(s.file));
  const allCss = styles.map((s) => s.text).join('\n');
  const vars = rootVars(styles);

  for (const s of markup) {
    const t = s.text, f = s.rel;
    const isJsx = /\.(jsx|tsx)$/i.test(s.file);
    const isDoc = /<html[\s>]/i.test(t);
    if (isDoc) {
      const html = t.match(/<html[^>]*>/i);
      if (html && !attr(html[0], 'lang')) hit('html-lang', f, lineAt(t, html.index));
      if (!/<main[\s>]|role=["']main["']/i.test(t)) hit('sin-main', f, lineAt(t, html.index));
      if (/<nav[\s>]/i.test(t) && !/href=["']#(?:main|contenido|content)/i.test(t)) hit('sin-skip-link', f, 1);
    }
    for (const h of matches(s, /<meta[^>]+name=["']viewport["'][^>]*>/i)) if (/user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0)?\b/i.test(h.m[0])) hit('zoom-bloqueado', f, h.line);
    for (const h of matches(s, /<img\b[^>]*>/i)) if (!attr(h.m[0], 'alt') && !/role=["'](?:presentation|none)["']/.test(h.m[0])) hit('img-alt', f, h.line);
    for (const h of matches(s, /<button\b([^>]*)>([\s\S]*?)<\/button>/i)) if (!named(h.m[0].slice(0, h.m[0].indexOf('>') + 1)) && !textOf(h.m[2]) && !hasSrOnlyText(h.m[2]) && !/\{[^}]+\}/.test(h.m[2].replace(/<[^>]+>/g, ''))) hit('boton-sin-nombre', f, h.line);
    for (const h of matches(s, /<(?:a|Link)\b([^>]*\bhref[^>]*)>([\s\S]*?)<\/(?:a|Link)>/i)) if (!named(`<a ${h.m[1]}>`) && !textOf(h.m[2]) && !hasSrOnlyText(h.m[2]) && !/\{[^}]+\}/.test(h.m[2].replace(/<[^>]+>/g, ''))) hit('enlace-sin-nombre', f, h.line);
    // Campos: etiqueta por for/htmlFor, envoltura en <label>, aria-label/labelledby o title.
    const labelFor = new Set([...t.matchAll(/<label\b[^>]*\b(?:for|htmlFor)\s*=\s*(?:"([^"]+)"|'([^']+)'|\{["']([^"']+)["']\})/gi)].map((m) => m[1] || m[2] || m[3]));
    for (const h of matches(s, /<(input|select|textarea)\b[^>]*>/i)) {
      const tag = h.m[0];
      const type = (attrVal(tag, 'type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
      if (named(tag)) continue;
      const id = attrVal(tag, 'id');
      if (id && labelFor.has(id)) continue;
      const before = t.slice(0, h.m.index), open = before.lastIndexOf('<label'), close = before.lastIndexOf('</label>');
      if (open > close) continue;
      hit('control-sin-etiqueta', f, h.line, attr(tag, 'placeholder') ? 'solo tiene placeholder' : '');
    }
    for (const h of matches(s, /<(div|span|li|td|tr|img|section|article|p)\b[^>]*\bon(?:click|Click)\s*=[^>]*>/)) if (!attr(h.m[0], 'role') || !/tab[iI]ndex/.test(h.m[0])) hit('click-sin-teclado', f, h.line, `<${h.m[1]}>`);
    for (const h of matches(s, /tab[iI]ndex\s*=\s*(?:["']|\{)\s*([1-9]\d*)/)) hit('tabindex-positivo', f, h.line);
    for (const h of matches(s, /<(?:button|a|input|select|textarea)\b[^>]*aria-hidden\s*=\s*(?:["']true["']|\{true\})[^>]*>/i)) hit('aria-hidden-enfocable', f, h.line);
    for (const h of matches(s, /<(?:video|audio)\b[^>]*\bautoplay\b[^>]*>/i)) if (!/\bmuted\b/i.test(h.m[0]) || /<audio/i.test(h.m[0])) hit('autoplay', f, h.line);
    for (const h of matches(s, /<iframe\b[^>]*>/i)) if (!attr(h.m[0], 'title')) hit('iframe-sin-titulo', f, h.line);
    for (const h of matches(s, /<table\b[\s\S]*?<\/table>/i)) if (!/<th[\s>]|role=["']columnheader/i.test(h.m[0])) hit('tabla-sin-encabezados', f, h.line);
    // Encabezados: solo en documentos completos o archivos con varios encabezados (en un componente suelto el contexto falta).
    const hs = [...t.matchAll(/<h([1-6])\b/gi)].map((m) => ({ n: +m[1], i: m.index }));
    if (isDoc || hs.length >= 3) {
      if (isDoc && hs.filter((x) => x.n === 1).length !== 1) hit('encabezados', f, hs[0] ? lineAt(t, hs[0].i) : 1, `${hs.filter((x) => x.n === 1).length} h1`);
      for (let i = 1; i < hs.length; i++) if (hs[i].n > hs[i - 1].n + 1) { hit('encabezados', f, lineAt(t, hs[i].i), `h${hs[i - 1].n} → h${hs[i].n}`); break; }
    }
    const ids = {};
    for (const m of t.matchAll(/\sid\s*=\s*["']([^"'{}]+)["']/g)) (ids[m[1]] = ids[m[1]] || []).push(m.index);
    if (!isJsx) for (const [id, at] of Object.entries(ids)) if (at.length > 1) hit('ids-duplicados', f, lineAt(t, at[1]), `#${id}`);
  }

  // CSS: foco, movimiento, texto chico, contraste declarado.
  const removesOutline = styles.flatMap((s) => matches(s, /:focus(?!-visible|-within)[^{]*\{[^}]*outline\s*:\s*(?:none|0)\b/));
  const removesOutlineAny = styles.flatMap((s) => matches(s, /\{[^}]*outline\s*:\s*(?:none|0)\s*[;}]/)).filter((h) => !/:focus-visible/.test(h.m[0]));
  if ((removesOutline.length || removesOutlineAny.length) && !/:focus-visible/.test(allCss) && !/focus-visible:/.test(markup.map((s) => s.text).join(''))) for (const h of [...removesOutline, ...removesOutlineAny].slice(0, 3)) hit('foco-oculto', h.file, h.line);
  const animates = /@keyframes|animation\s*:|transition\s*:/.test(allCss);
  if (animates && !/prefers-reduced-motion/.test(allCss) && !/motion-safe:|motion-reduce:/.test(markup.map((s) => s.text).join(''))) {
    const first = styles.flatMap((s) => matches(s, /@keyframes|animation\s*:|transition\s*:/))[0];
    if (first) hit('sin-reduced-motion', first.file, first.line);
  }
  for (const s of styles) {
    for (const h of matches(s, /font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)/)) { const px = h.m[2] === 'rem' ? +h.m[1] * 16 : +h.m[1]; if (px < 12) hit('texto-chico', h.file, h.line, `${h.m[1]}${h.m[2]}`); }
    for (const h of matches(s, /([^{}]+)\{([^{}]*)\}/)) {
      const sel = h.m[1].trim(), body = h.m[2];
      h.line += (h.m[1].match(/^\s*/)[0].match(/\n/g) || []).length; // la regla empieza donde empieza el selector
      const fg = body.match(/(?:^|;|\s)color\s*:\s*([^;]+)/), bg = body.match(/background(?:-color)?\s*:\s*([^;]+)/);
      if (fg && bg) {
        const a = resolve(fg[1], vars), b = resolve(bg[1], vars);
        if (a && b) {
          const r = C.contrast(b, a);
          const size = body.match(/font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)/); const px = size ? (size[2] === 'rem' ? +size[1] * 16 : +size[1]) : 16;
          const bold = /font-weight\s*:\s*(?:bold|[6-9]00)/.test(body);
          const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5;
          if (r < need) hit('contraste', h.file, h.line, `${sel.slice(0, 40)}: ${r.toFixed(2)}:1 (necesita ${need})`);
        }
      }
      const bc = body.match(/border(?:-color)?\s*:\s*([^;]+)/);
      if (bc && /\b(?:input|select|textarea|\.input|\.field|\.form-control)\b/.test(sel)) {
        const a = resolve(bc[1], vars), b = resolve((bg && bg[1]) || vars['--surface'] || vars['--bg'] || '#ffffff', vars);
        if (a && b && C.contrast(a, b) < 3) hit('contraste-ui', h.file, h.line, `${sel.slice(0, 30)}: ${C.contrast(a, b).toFixed(2)}:1`);
      }
    }
  }
  // Pares de tokens de :root (texto contra fondo) aunque no se usen juntos en una regla.
  const pick = (re) => Object.keys(vars).find((k) => re.test(k));
  const txt = pick(/^--(?:color-)?(?:text|fg|foreground|ink)$/), bgv = pick(/^--(?:color-)?(?:bg|background|surface|paper)$/), muted = pick(/^--(?:color-)?(?:text-)?(?:muted|secondary|subtle)$/);
  for (const [k, label] of [[txt, 'texto'], [muted, 'texto secundario']]) {
    if (!k || !bgv) continue;
    const a = resolve(vars[k], vars), b = resolve(vars[bgv], vars);
    if (a && b && C.contrast(b, a) < 4.5) {
      const s = styles.find((x) => x.text.includes(`${k}:`) || x.text.includes(`${k} :`));
      hit('contraste', s ? s.rel : ':root', s ? lineAt(s.text, s.text.indexOf(k)) : 1, `${label} ${k} sobre ${bgv}: ${C.contrast(b, a).toFixed(2)}:1`);
    }
  }

  const findings = Object.entries(hits).map(([id, hs]) => {
    const r = RULES[id];
    return finding({ source: 'a11y', id, title: r.title, severity: r.sev, wcag: r.wcag, where: where(hs), evidence: `${hs.length} caso(s)${hs.find((h) => h.note) ? `; ej.: ${hs.find((h) => h.note).note}` : ''}`, fix: r.fix, effort: hs.length > 10 ? 'M' : r.effort });
  });
  const order = { P0: 0, P1: 1, P2: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const cnt = (sev) => findings.filter((x) => x.severity === sev).reduce((a, x) => a + Math.min(5, hits[x.id].length), 0);
  const p0 = cnt('P0'), p1 = cnt('P1'), p2 = cnt('P2');
  const score = Math.max(0, Math.round(100 - Math.min(60, p0 * 12) - Math.min(30, p1 * 5) - Math.min(10, p2 * 2)));
  return {
    tool: 'a11y', files: srcs.length, score, max: 100,
    counts: { P0: findings.filter((x) => x.severity === 'P0').length, P1: findings.filter((x) => x.severity === 'P1').length, P2: findings.filter((x) => x.severity === 'P2').length },
    findings,
    manual: ['Recorrer todo con Tab y Shift+Tab: orden lógico, foco siempre visible, sin trampas de foco en modales.', 'Lector de pantalla (NVDA en Windows, VoiceOver en macOS) en el flujo principal.', 'Zoom al 200 % y ancho de 320 px sin pérdida de contenido (1.4.10).', 'Objetivos táctiles de al menos 24×24 px (2.5.8).', 'Mensajes de estado anunciados con aria-live (4.1.3).', 'Contraste de estados hover, foco, deshabilitado y sobre imágenes.'],
  };
}

if (require.main === module) {
  const { pos, opt } = args(process.argv.slice(2), ['json']);
  if (!pos.length) { console.error('Uso: node a11y-scan.cjs <archivo|carpeta>... [--json] [--out f.json] [--max-p0 N]'); process.exit(2); }
  let res;
  try { res = scan(pos); } catch (e) { console.error(e.message); process.exit(2); }
  if (opt.out) writeJson(opt.out, res);
  if (opt.json) console.log(JSON.stringify(res, null, 2));
  else {
    console.log(`Accesibilidad (estática): ${res.score}/100 en ${res.files} archivo(s) — P0 ${res.counts.P0}, P1 ${res.counts.P1}, P2 ${res.counts.P2}`);
    for (const x of res.findings) console.log(`- ${x.severity} [${x.wcag}] ${x.id}: ${x.title} — ${x.where} (${x.evidence})\n    Corrección: ${x.fix}`);
    console.log('\nFalta verificar a mano (el análisis estático no lo ve):');
    for (const m of res.manual) console.log(`  · ${m}`);
  }
  process.exit(opt['max-p0'] !== undefined && res.counts.P0 > Number(opt['max-p0']) ? 1 : 0);
}

module.exports = { scan, RULES };
