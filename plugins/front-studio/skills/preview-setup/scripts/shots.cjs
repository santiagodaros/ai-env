#!/usr/bin/env node
// Capturas de antes y después de una UI con Playwright, y comparación lado a lado con porcentaje de cambio.
// Uso:
//   node shots.cjs before [--url http://localhost:5173/] [--routes "/,/costos,#/inicio"] [--widths 390,1280] [--full] [--dark] [--wait 600] [--out design/shots]
//   node shots.cjs after  (mismas opciones; por defecto repite las rutas y anchos de "before")
//   node shots.cjs compare [--out design/shots]      → design/shots/compare.html
// Sin --url toma el primer puerto de .claude/launch.json. El servidor tiene que estar corriendo.
// No commitees design/shots/: son binarios. Agregalo a .gitignore.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadPlaywright, HOW_TO } = require('../../../lib/playwright.cjs');

function opts(argv) {
  const o = { phase: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--full' || a === '--dark') o[a.slice(2)] = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
  }
  return o;
}
const slug = (r) => (r.replace(/^[#/]+/, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'inicio').slice(0, 60);
function urlFromLaunch() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join('.claude', 'launch.json'), 'utf8'));
    const c = (j.configurations || []).find((x) => x.port);
    return c ? (c.url || `http://localhost:${c.port}/`) : null;
  } catch { return null; }
}
function join(base, route) {
  if (route.startsWith('#')) return base.replace(/#.*$/, '') + route;
  if (/^https?:|^file:/.test(route)) return route;
  return new URL(route, base.endsWith('/') ? base : base + '/').href;
}

async function capture(o) {
  const out = o.out || path.join('design', 'shots');
  const prev = o.phase === 'after' ? readManifest(path.join(out, 'before')) : null;
  const url = o.url || (prev && prev.url) || urlFromLaunch();
  if (!url) { console.error('Falta --url y no hay puerto en .claude/launch.json.'); process.exit(2); }
  const routes = (o.routes ? o.routes.split(',') : prev ? prev.routes : ['/']).map((r) => r.trim()).filter(Boolean);
  const widths = (o.widths ? o.widths.split(',') : prev ? prev.widths.map(String) : ['390', '1280']).map(Number).filter((w) => w >= 200);
  const pw = loadPlaywright();
  if (!pw) { console.error(HOW_TO); process.exit(3); }
  const dir = path.join(out, o.phase);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await pw.chromium.launch();
  const files = [], problems = [];
  try {
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: 1, colorScheme: o.dark ? 'dark' : 'light', reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      for (const r of routes) {
        const target = join(url, r);
        try { await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 }); }
        catch (e) { problems.push(`${r}@${w}: no cargó (${e.message.split('\n')[0]})`); continue; }
        await page.waitForTimeout(Number(o.wait || 600));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const f = `${slug(r)}@${w}.png`;
        await page.screenshot({ path: path.join(dir, f), fullPage: !!o.full });
        files.push({ route: r, width: w, file: f, overflow, errors: errors.splice(0) });
        if (overflow > 1) problems.push(`${r}@${w}: desborde horizontal de ${overflow}px`);
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ url, routes, widths, full: !!o.full, dark: !!o.dark, at: new Date().toISOString(), files }, null, 2));
  console.log(`${files.length} captura(s) en ${dir} (${url})`);
  for (const f of files) if (f.errors.length) problems.push(`${f.route}@${f.width}: ${f.errors.length} error(es) de consola, ej.: ${f.errors[0].slice(0, 120)}`);
  for (const p of problems) console.log(`  AVISO ${p}`);
  if (o.phase === 'after') console.log(`Siguiente: node "${__filename}" compare${o.out ? ` --out ${o.out}` : ''}`);
}

function readManifest(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { return null; } }

// Porcentaje de píxeles que cambian (tolerancia para antialias), calculado en un canvas de Chromium.
async function diffs(pairs) {
  const pw = loadPlaywright(); if (!pw) return null;
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage();
    const res = [];
    for (const p of pairs) {
      const a = 'data:image/png;base64,' + fs.readFileSync(p.a).toString('base64');
      const b = 'data:image/png;base64,' + fs.readFileSync(p.b).toString('base64');
      res.push(await page.evaluate(async ([a, b]) => {
        const load = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
        const get = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
        const da = get(ia), db = get(ib);
        let changed = 0;
        for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) changed++;
        return { pct: +(100 * changed / (w * h)).toFixed(1), sizeA: `${ia.width}×${ia.height}`, sizeB: `${ib.width}×${ib.height}` };
      }, [a, b]));
    }
    return res;
  } finally { await browser.close(); }
}

async function compare(o) {
  const out = o.out || path.join('design', 'shots');
  const A = readManifest(path.join(out, 'before')), B = readManifest(path.join(out, 'after'));
  if (!A || !B) { console.error(`Faltan capturas: corré "before" y "after" (busco ${out}/before y ${out}/after).`); process.exit(2); }
  const pairs = A.files.filter((f) => B.files.some((g) => g.file === f.file)).map((f) => ({ ...f, after: B.files.find((g) => g.file === f.file), a: path.join(out, 'before', f.file), b: path.join(out, 'after', f.file) }));
  if (!pairs.length) { console.error('No hay capturas con la misma ruta y ancho en before y after.'); process.exit(2); }
  const d = await diffs(pairs);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const figs = pairs.map((p, i) => `<section class="pair">
  <h2>${esc(p.route)} <span>${p.width}px${d ? ` · ${d[i].pct}% de píxeles cambiaron` : ''}${d && d[i].sizeA !== d[i].sizeB ? ` · tamaño ${d[i].sizeA} → ${d[i].sizeB}` : ''}</span></h2>
  <div class="cmp" style="--pos:50%">
    <img src="after/${esc(p.file)}" alt="Después: ${esc(p.route)} a ${p.width}px">
    <div class="before"><img src="before/${esc(p.file)}" alt="Antes: ${esc(p.route)} a ${p.width}px"></div>
    <input type="range" min="0" max="100" value="50" aria-label="Deslizar entre antes y después para ${esc(p.route)} a ${p.width}px">
  </div>
  <div class="side"><figure><figcaption>Antes</figcaption><img src="before/${esc(p.file)}" alt=""></figure><figure><figcaption>Después</figcaption><img src="after/${esc(p.file)}" alt=""></figure></div>
</section>`).join('\n');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Antes y después</title>
<style>
:root { --bg: #f6f7f9; --fg: #1d232a; --muted: #5a6572; --line: #d6dbe1; --mark: #0b57d0; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #14171b; --fg: #e4e8ec; --muted: #9aa5b1; --line: #313840; --mark: #8ab4f8; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #14171b; --fg: #e4e8ec; --muted: #9aa5b1; --line: #313840; --mark: #8ab4f8; color-scheme: dark; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1400px; margin: 0 auto; padding-inline: 16px; padding-block: 24px; display: grid; gap: 40px; }
h1 { margin: 0; font-size: 1.5rem; } p.meta { margin: 4px 0 0; color: var(--muted); }
h2 { font-size: 1.05rem; margin: 0 0 8px; } h2 span { color: var(--muted); font-weight: 400; font-variant-numeric: tabular-nums; }
.cmp { position: relative; border: 1px solid var(--line); overflow: hidden; width: fit-content; max-width: 100%; }
.cmp img { display: block; width: auto; max-width: 100%; height: auto; }
.cmp .before { position: absolute; inset: 0; clip-path: inset(0 calc(100% - var(--pos)) 0 0); border-right: 2px solid var(--mark); }
.cmp input { position: absolute; inset: auto 0 8px 0; width: calc(100% - 32px); margin: 0 16px; }
.side { display: none; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 12px; }
.side img { width: auto; max-width: 100%; height: auto; border: 1px solid var(--line); } figure { margin: 0; } figcaption { color: var(--muted); font-size: .85rem; }
body.lado .side { display: grid; } body.lado .cmp { display: none; }
button { font: inherit; padding: 6px 12px; border: 1px solid var(--line); background: transparent; color: var(--fg); border-radius: 6px; cursor: pointer; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--mark); outline-offset: 2px; }
</style></head>
<body><main>
<header><h1>Antes y después</h1><p class="meta">Antes: ${esc(A.at.slice(0, 16).replace('T', ' '))} · Después: ${esc(B.at.slice(0, 16).replace('T', ' '))} · ${esc(B.url)}</p>
<p><button type="button" id="mode">Ver lado a lado</button></p></header>
${figs}
</main>
<script>
document.querySelectorAll('.cmp input').forEach(function (r) { r.addEventListener('input', function () { r.parentNode.style.setProperty('--pos', r.value + '%'); }); });
document.getElementById('mode').addEventListener('click', function (e) { var on = document.body.classList.toggle('lado'); e.target.textContent = on ? 'Ver con deslizador' : 'Ver lado a lado'; });
</script>
</body></html>
`;
  const file = path.join(out, 'compare.html');
  fs.writeFileSync(file, html);
  console.log(`Comparación en ${file} (${pairs.length} par(es))`);
  if (d) pairs.forEach((p, i) => console.log(`  ${p.route}@${p.width}: ${d[i].pct}% cambió`));
  else console.log('  Sin Playwright no se calcula el porcentaje; la página igual muestra antes/después.');
}

if (require.main === module) {
  const o = opts(process.argv.slice(2));
  const run = o.phase === 'before' || o.phase === 'after' ? capture : o.phase === 'compare' ? compare : null;
  if (!run) { console.error('Uso: node shots.cjs before|after|compare [--url URL] [--routes "/,/x,#/y"] [--widths 390,1280] [--full] [--dark] [--out design/shots]'); process.exit(2); }
  run(o).catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { slug, join };
