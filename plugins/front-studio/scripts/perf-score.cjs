#!/usr/bin/env node
// Puntaje de performance de una UI (0-100) con plan de corrección.
// Uso: node perf-score.cjs <index.html|carpeta-build> [--url http://localhost:5173/] [--perfil movil|escritorio] [--json] [--out f.json]
//  - Siempre: análisis estático del HTML y sus recursos locales (peso de JS/CSS/imágenes/fuentes, bloqueo de render,
//    imágenes sin dimensiones o sin carga diferida, fuentes sin font-display, @import, DOM grande).
//  - Con --url y Playwright disponible: medición de laboratorio en Chromium local (FCP, LCP, CLS, TBT) con
//    perfil móvil (CPU 4x, red lenta) o escritorio. NO es Lighthouse ni datos de campo: la salida lo aclara.
// El puntaje final pondera 80 % laboratorio y 20 % estático cuando hay medición; si no, es solo la estimación estática.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { args, finding, writeJson, lineAt } = require('../lib/scan.cjs');
const { loadPlaywright, HOW_TO } = require('../lib/playwright.cjs');

const KB = 1024;
const fmt = (b) => (b >= KB * KB ? `${(b / KB / KB).toFixed(1)} MB` : `${Math.round(b / KB)} KB`);
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const isExternal = (u) => /^(?:https?:)?\/\//i.test(u);

function readLocal(ref, htmlFile, root) {
  if (!ref || isExternal(ref) || /^(?:data|blob|mailto|tel|#|javascript):/i.test(ref)) return null;
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
  const p = clean.startsWith('/') ? path.join(root, clean) : path.join(path.dirname(htmlFile), clean);
  try { return { path: p, buf: fs.readFileSync(p) }; } catch { return null; }
}

function staticAnalysis(input) {
  const st = fs.statSync(input);
  const root = st.isDirectory() ? input : path.dirname(input);
  const htmls = st.isDirectory() ? fs.readdirSync(input).filter((f) => /\.html?$/i.test(f)).map((f) => path.join(input, f)) : [input];
  if (!htmls.length) throw new Error(`No hay archivos .html en ${input}`);
  const F = []; // hallazgos
  const add = (id, severity, title, where, evidence, fix, effort = 'S', penalty = 5) => F.push({ ...finding({ source: 'perf', id, title, severity, where, evidence, fix, effort }), penalty });
  const m = { js: 0, jsGz: 0, css: 0, cssGz: 0, img: 0, font: 0, requests: 0, thirdParty: 0, dom: 0 };
  const seen = new Set();
  for (const file of htmls) {
    const html = fs.readFileSync(file, 'utf8');
    const rel = path.relative(process.cwd(), file) || path.basename(file);
    const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
    m.dom = Math.max(m.dom, (html.match(/<[a-zA-Z][\w-]*[\s>/]/g) || []).length);
    const count = (ref, kind) => {
      if (!ref) return null;
      if (isExternal(ref)) { if (!seen.has(ref)) { seen.add(ref); m.requests++; m.thirdParty++; } return null; }
      const r = readLocal(ref, file, root); if (!r || seen.has(r.path)) return r;
      seen.add(r.path); m.requests++;
      if (kind === 'js') { m.js += r.buf.length; m.jsGz += gz(r.buf); }
      if (kind === 'css') { m.css += r.buf.length; m.cssGz += gz(r.buf); }
      if (kind === 'img') m.img += r.buf.length;
      return r;
    };
    // Scripts
    const blocking = [];
    for (const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const at = s[1], src = (at.match(/\ssrc\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (src) count(src, 'js');
      else { const b = Buffer.from(s[2]); m.js += b.length; m.jsGz += gz(b); if (b.length > 100 * KB) add('script-inline-grande', 'P1', 'Script inline muy grande', `${rel}:${lineAt(html, s.index)}`, fmt(b.length), 'Movelo a un archivo con defer para que se cachee y no bloquee el parseo.', 'M', 6); }
      if (src && head.includes(s[0]) && !/\s(?:async|defer)\b|type\s*=\s*["']module["']/i.test(at)) blocking.push(`${rel}:${lineAt(html, s.index)}`);
    }
    // Hojas de estilo y fuentes externas
    const sheets = [...head.matchAll(/<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi)];
    for (const l of sheets) {
      const href = (l[0].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
      const r = count(href, 'css');
      if (href && /fonts\.googleapis\.com/.test(href) && !/display=(?:swap|optional|fallback)/.test(href)) add('google-fonts-sin-display', 'P1', 'Google Fonts sin display=swap', rel, href.slice(0, 80), 'Agregá &display=swap a la URL para que el texto se vea mientras carga la fuente.', 'S', 5);
      if (r) for (const imp of r.buf.toString('utf8').matchAll(/@import\s+(?:url\()?["']?([^"');]+)/g)) add('css-import', 'P1', '@import en CSS (carga en cadena)', path.relative(process.cwd(), r.path), imp[1], 'Reemplazalo por <link> en el HTML o empaquetalo en el build.', 'S', 4);
    }
    if (sheets.length > 3) add('muchas-hojas', 'P2', `${sheets.length} hojas de estilo que bloquean el render`, rel, '', 'Unificá en una o dos hojas; el CSS crítico puede ir inline.', 'M', 3);
    if (blocking.length) add('script-bloqueante', 'P1', 'Scripts en <head> sin defer ni async', blocking.slice(0, 3).join(', '), `${blocking.length} script(s)`, 'Agregá defer (o type="module"); el parseo del HTML no debería esperar al JS.', 'S', Math.min(15, 5 * blocking.length));
    if (/fonts\.googleapis\.com/.test(head) && !/rel\s*=\s*["']preconnect["'][^>]*fonts\.gstatic\.com|fonts\.gstatic\.com[^>]*rel\s*=\s*["']preconnect["']/i.test(head)) add('sin-preconnect-fuentes', 'P2', 'Sin preconnect a fonts.gstatic.com', rel, '', '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>', 'S', 2);
    // Imágenes
    const imgs = [...html.matchAll(/<img\b[^>]*>/gi)];
    const noDims = [], noLazy = [], heavy = [], legacy = [];
    imgs.forEach((im, i) => {
      const tag = im[0], ln = `${rel}:${lineAt(html, im.index)}`;
      if (!(/\swidth\s*=/.test(tag) && /\sheight\s*=/.test(tag)) && !/aspect-ratio/.test(tag)) noDims.push(ln);
      if (i >= 2 && !/loading\s*=\s*["']lazy["']/i.test(tag) && !/fetchpriority\s*=\s*["']high/i.test(tag)) noLazy.push(ln);
      const src = (tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i) || [])[1];
      const r = count(src, 'img');
      if (r) {
        if (r.buf.length > 200 * KB) heavy.push(`${ln} (${fmt(r.buf.length)})`);
        if (/\.(png|jpe?g|gif)$/i.test(r.path) && r.buf.length > 100 * KB) legacy.push(ln);
      }
    });
    if (noDims.length) add('img-sin-dimensiones', 'P1', 'Imágenes sin width/height (corrimiento de diseño)', noDims.slice(0, 3).join(', '), `${noDims.length} imagen(es)`, 'Declará width y height (o aspect-ratio) para reservar el espacio antes de que cargue.', 'S', Math.min(12, 3 * noDims.length));
    if (noLazy.length) add('img-sin-lazy', 'P2', 'Imágenes fuera de la primera vista sin loading="lazy"', noLazy.slice(0, 3).join(', '), `${noLazy.length} imagen(es)`, 'loading="lazy" para todo lo que no se ve al abrir; fetchpriority="high" solo para la imagen principal.', 'S', Math.min(6, noLazy.length));
    if (heavy.length) add('img-pesada', 'P1', 'Imágenes de más de 200 KB', heavy.slice(0, 3).join(', '), `${heavy.length} imagen(es)`, 'Redimensioná al tamaño mostrado y usá srcset con varios anchos.', 'M', Math.min(15, 5 * heavy.length));
    if (legacy.length) add('img-formato', 'P2', 'PNG/JPG/GIF grandes', legacy.slice(0, 3).join(', '), `${legacy.length} imagen(es)`, 'Convertí a AVIF o WebP (sharp, squoosh) con <picture> y respaldo.', 'S', Math.min(6, 2 * legacy.length));
    // Base64 inline
    const b64 = [...html.matchAll(/data:[\w/+.-]+;base64,([A-Za-z0-9+/=]+)/g)].reduce((a, x) => a + x[1].length * 0.75, 0);
    if (b64 > 100 * KB) add('base64-inline', 'P2', 'Recursos embebidos en base64 dentro del HTML', rel, fmt(b64), 'Archivos aparte (se cachean y no agrandan el HTML inicial).', 'S', 4);
    // CSS inline + hojas locales: @font-face sin font-display, cantidad de fuentes.
    const cssTexts = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((x) => x[1]);
    for (const l of sheets) { const r = readLocal((l[0].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1], file, root); if (r) cssTexts.push(r.buf.toString('utf8')); }
    for (const css of cssTexts) {
      for (const ff of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
        if (!/font-display/.test(ff[0])) add('font-display', 'P1', '@font-face sin font-display', rel, ff[0].slice(0, 60), 'font-display: swap (u optional si la fuente es decorativa).', 'S', 4);
        for (const u of ff[0].matchAll(/url\(\s*["']?([^"')]+)/g)) { const r = readLocal(u[1], file, root); if (r && !seen.has(r.path)) { seen.add(r.path); m.requests++; m.font += r.buf.length; } }
      }
    }
  }
  if (m.dom > 1500) F.push({ ...finding({ source: 'perf', id: 'dom-grande', title: `DOM grande (${m.dom} elementos)`, severity: m.dom > 3000 ? 'P1' : 'P2', where: '', evidence: `${m.dom} elementos`, fix: 'Virtualizá listas y tablas largas; renderizá bajo demanda lo que está oculto.', effort: 'M' }), penalty: m.dom > 3000 ? 10 : 5 });
  if (m.jsGz > 170 * KB) F.push({ ...finding({ source: 'perf', id: 'js-pesado', title: 'JavaScript por encima del presupuesto (170 KB comprimido)', severity: m.jsGz > 350 * KB ? 'P0' : 'P1', where: '', evidence: `${fmt(m.jsGz)} comprimido (${fmt(m.js)} sin comprimir)`, fix: 'Dividí por ruta (import() dinámico), sacá dependencias pesadas y revisá el bundle con un analizador.', effort: 'L' }), penalty: Math.min(25, Math.round((m.jsGz - 170 * KB) / (20 * KB)) + 8) });
  if (m.cssGz > 60 * KB) F.push({ ...finding({ source: 'perf', id: 'css-pesado', title: 'CSS por encima del presupuesto (60 KB comprimido)', severity: 'P2', where: '', evidence: fmt(m.cssGz), fix: 'Eliminá CSS sin uso (purge del framework) y separá por ruta.', effort: 'M' }), penalty: 5 });
  if (m.font > 300 * KB) F.push({ ...finding({ source: 'perf', id: 'fuentes-pesadas', title: 'Fuentes pesadas', severity: 'P2', where: '', evidence: fmt(m.font), fix: 'Subconjunto de caracteres, solo los pesos usados, formato woff2; una fuente variable si usás muchos pesos.', effort: 'S' }), penalty: 4 });
  if (m.thirdParty > 5) F.push({ ...finding({ source: 'perf', id: 'terceros', title: `${m.thirdParty} recursos de terceros`, severity: 'P2', where: '', evidence: '', fix: 'Cada dominio externo agrega DNS + TLS; alojá lo que puedas o cargalo después de la interacción.', effort: 'M' }), penalty: 4 });
  const penalty = F.reduce((a, f) => a + f.penalty, 0);
  return { metrics: m, findings: F.map(({ penalty: _p, ...f }) => f), score: Math.max(0, 100 - penalty) };
}

// Escala tipo Lighthouse: hasta "bueno" da 90-100, hasta "malo" 50-90, después cae a 0.
function band(v, good, poor) {
  if (v <= good) return 100 - 10 * (v / good);
  if (v <= poor) return 90 - 40 * ((v - good) / (poor - good));
  return Math.max(0, 50 - 50 * ((v - poor) / poor));
}
const TH = { fcp: [1800, 3000], lcp: [2500, 4000], tbt: [200, 600], cls: [0.1, 0.25] };
const W = { fcp: 0.1, lcp: 0.3, tbt: 0.35, cls: 0.25 };

async function lab(url, perfil) {
  const pw = loadPlaywright();
  if (!pw) return { error: HOW_TO };
  const mobile = perfil !== 'escritorio';
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 412, height: 823 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1350, height: 940 } });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    if (mobile) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.addInitScript(() => {
      const p = (window.__perf = { lcp: 0, cls: 0, tbt: 0, fcp: 0, longtasks: 0 });
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) p.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) { /* sin soporte */ }
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) p.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) { /* sin soporte */ }
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') p.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch (e) { /* sin soporte */ }
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { p.longtasks++; if (!p.fcp || e.startTime >= p.fcp) p.tbt += Math.max(0, e.duration - 50); } }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* sin soporte */ }
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const res = performance.getEntriesByType('resource');
      const nav = performance.getEntriesByType('navigation')[0];
      return { ...window.__perf, requests: res.length + 1, transfer: res.reduce((a, x) => a + (x.transferSize || x.encodedBodySize || 0), 0) + ((nav && (nav.transferSize || nav.encodedBodySize)) || 0) };
    });
    if (!r.lcp) r.lcp = r.fcp; // sin LCP medible (p. ej. solo texto): usar FCP
    const sub = Object.fromEntries(Object.keys(W).map((k) => [k, Math.round(band(r[k], ...TH[k]))]));
    const score = Math.round(Object.keys(W).reduce((a, k) => a + W[k] * sub[k], 0));
    return { perfil: mobile ? 'movil' : 'escritorio', fcp: Math.round(r.fcp), lcp: Math.round(r.lcp), cls: +r.cls.toFixed(3), tbt: Math.round(r.tbt), requests: r.requests, transfer: r.transfer, sub, score, errors: errors.slice(0, 5) };
  } finally { await browser.close(); }
}

function labFindings(L) {
  const F = [];
  const rate = (k) => (L[k] > TH[k][1] ? 'P0' : L[k] > TH[k][0] ? 'P1' : null);
  const fx = {
    lcp: ['LCP lento', 'Identificá el elemento LCP (imagen o bloque principal): precargalo, servilo en el tamaño justo, fetchpriority="high", y que no dependa de JS para pintarse.'],
    tbt: ['Tareas largas de JavaScript (TBT alto)', 'Partí el JS por ruta, diferí lo que no hace falta al abrir y mové trabajo pesado fuera del hilo principal.'],
    cls: ['Corrimientos de diseño (CLS)', 'Reservá espacio para imágenes, anuncios, fuentes y contenido que llega tarde; no insertes contenido arriba del que ya se ve.'],
    fcp: ['Primer pintado lento (FCP)', 'Reducí el CSS y JS bloqueantes del <head>, inline del CSS crítico, preconnect a orígenes de fuentes.'],
  };
  for (const k of ['lcp', 'tbt', 'cls', 'fcp']) {
    const sev = rate(k); if (!sev) continue;
    const v = k === 'cls' ? L[k] : `${L[k]} ms`;
    F.push(finding({ source: 'perf', id: `lab-${k}`, title: fx[k][0], severity: sev, where: `perfil ${L.perfil}`, evidence: `${k.toUpperCase()} ${v} (bueno ≤ ${k === 'cls' ? TH[k][0] : TH[k][0] + ' ms'})`, fix: fx[k][1], effort: k === 'tbt' ? 'L' : 'M' }));
  }
  if (L.errors.length) F.push(finding({ source: 'perf', id: 'errores-consola', title: 'Errores de JavaScript al cargar', severity: 'P1', where: L.errors[0].slice(0, 80), evidence: `${L.errors.length} error(es)`, fix: 'Corregilos antes de medir: un error puede dejar la página a medio pintar.', effort: 'S' }));
  return F;
}

async function main() {
  const { pos, opt } = args(process.argv.slice(2), ['json']);
  if (!pos.length && !opt.url) { console.error('Uso: node perf-score.cjs <index.html|carpeta-build> [--url URL] [--perfil movil|escritorio] [--json] [--out f.json]'); process.exit(2); }
  let S = { metrics: null, findings: [], score: null };
  try { if (pos[0]) S = staticAnalysis(pos[0]); } catch (e) { console.error(e.message); process.exit(2); }
  let L = null;
  if (opt.url) L = await lab(opt.url, opt.perfil);
  const labOk = L && !L.error;
  const score = labOk ? Math.round(S.score === null ? L.score : 0.8 * L.score + 0.2 * S.score) : S.score;
  const basis = labOk ? `laboratorio local (Chromium, perfil ${L.perfil}) ${S.score === null ? '' : '80 % + estático 20 %'}`.trim() : 'estimación estática (sin medir en navegador)';
  const res = { tool: 'perf', score, max: 100, basis, static: S.score === null ? null : { score: S.score, metrics: S.metrics }, lab: labOk ? L : null, labError: L && L.error ? L.error : undefined, findings: [...(labOk ? labFindings(L) : []), ...S.findings] };
  if (opt.out) writeJson(opt.out, res);
  if (opt.json) { console.log(JSON.stringify(res, null, 2)); return; }
  console.log(`Performance: ${score ?? '—'}/100 — ${basis}`);
  if (labOk) console.log(`  FCP ${L.fcp} ms · LCP ${L.lcp} ms · TBT ${L.tbt} ms · CLS ${L.cls} · ${L.requests} pedidos · ${fmt(L.transfer)} transferidos`);
  if (L && L.error) console.log(`  Sin medición de laboratorio. ${L.error}`);
  if (S.metrics) console.log(`  Estático: JS ${fmt(S.metrics.jsGz)} comprimido, CSS ${fmt(S.metrics.cssGz)}, imágenes ${fmt(S.metrics.img)}, fuentes ${fmt(S.metrics.font)}, ${S.metrics.requests} recursos, DOM ${S.metrics.dom} elementos`);
  for (const f of res.findings) console.log(`- ${f.severity} ${f.id}: ${f.title}${f.where ? ` — ${f.where}` : ''}${f.evidence ? ` (${f.evidence})` : ''}\n    Corrección: ${f.fix}`);
  if (!labOk) console.log('\nPara medir de verdad: levantá el sitio y repetí con --url. Para datos de campo, PageSpeed Insights / CrUX sobre la URL pública.');
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(2); });
module.exports = { staticAnalysis, band };
