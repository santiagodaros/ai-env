// Pruebas de front-studio: analizadores, plan de trabajo, quiz, kit de página, launch.json y capturas.
// Las llama tests/smoke-test.js. Lo que necesita Playwright se marca AVISO si no está instalado.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = function frontStudio({ check, add, run }) {
  const FS = path.join(__dirname, '..', 'plugins', 'front-studio');
  const S = (f) => path.join(FS, 'scripts', f);
  const K = (skill, f) => path.join(FS, 'skills', skill, 'scripts', f);
  const FX = path.join(__dirname, 'fixtures', 'front');
  const fx = (f) => path.join(FX, f);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aienv-front-'));
  const json = (r) => { try { return JSON.parse(r.out); } catch { return {}; } };
  const ids = (j) => (j.findings || []).map((x) => x.id);

  // Contraste
  let r = run(K('brand-intake', 'contrast.cjs'), ['#ffffff:#000000', 'rgb(255,255,255):#595959']);
  check('front-studio contrast: blanco/negro 21:1 y rgb() aceptado', r.code === 0 && /21\.00:1/.test(r.out) && /7\.00:1/.test(r.out));
  r = run(K('brand-intake', 'contrast.cjs'), ['#ffffff:#eeeeee']);
  check('front-studio contrast: un par que no llega a 3:1 sale con 1', r.code === 1);

  // Detector de look de IA
  r = run(S('ai-look.cjs'), [fx('generica.html'), '--json']);
  let j = json(r);
  const tells = (j.tells || []).map((t) => t.id);
  check('ai-look: la página genérica da índice alto', j.score >= 60, `índice ${j.score}`);
  check('ai-look: detecta crema+terracota, degradé violeta, radio único, fade-up y copy de venta', ['paleta-crema-terracota', 'degrade-violeta', 'radio-unico', 'entrada-fade-up', 'copy-de-venta', 'eyebrow-mayusculas', 'emoji-icono'].every((x) => tells.includes(x)), tells.join(','));
  check('ai-look: cada tic trae evidencia archivo:línea', (j.tells || []).every((t) => /generica\.html:\d+/.test(t.where)));
  r = run(S('ai-look.cjs'), [fx('generica.html'), '--json', '--allow', 'paleta-crema-terracota,degrade-violeta']);
  check('ai-look: --allow saca los tics elegidos a propósito', !(json(r).tells || []).some((t) => /paleta-crema|degrade-violeta/.test(t.id)) && (json(r).tells || []).length === tells.length - 2);
  const ign = path.join(tmp, 'muestrario.html');
  fs.writeFileSync(ign, '<style>.a{background:#F4F1EA}</style>\n<!-- ai-look:ignore -->\n<div style="background:#F4F1EA">x</div><div style="color:#D97757">y</div>\n<!-- /ai-look:ignore -->\n');
  check('ai-look: los bloques marcados ai-look:ignore no cuentan (muestrarios)', json(run(S('ai-look.cjs'), [ign, '--json'])).score === 0);
  r = run(S('ai-look.cjs'), [fx('generica.html'), '--max', '30']);
  check('ai-look: --max funciona como compuerta (sale con 1 si supera)', r.code === 1);
  for (const [name, p] of [['el ejemplo del plugin', path.join(FS, 'examples', 'portal-muestra')], ['la plantilla de opciones', path.join(FS, 'skills', 'ui-options', 'templates', 'options-shell.html')], ['una página limpia', fx('a11y-buena.html')]]) {
    r = run(S('ai-look.cjs'), [p, '--json']);
    check(`ai-look: ${name} queda en 15 o menos`, json(r).score <= 15, `índice ${json(r).score}`);
  }

  // Accesibilidad estática
  r = run(S('a11y-scan.cjs'), [fx('a11y-mala.html'), '--json']);
  j = json(r);
  const p0 = (j.findings || []).filter((x) => x.severity === 'P0').map((x) => x.id);
  check('a11y-scan: detecta los P0 básicos (lang, alt, botón y enlace sin nombre, campo sin etiqueta, clic sin teclado, foco, zoom, contraste)', ['html-lang', 'img-alt', 'boton-sin-nombre', 'enlace-sin-nombre', 'control-sin-etiqueta', 'click-sin-teclado', 'foco-oculto', 'zoom-bloqueado', 'contraste'].every((x) => p0.includes(x)), p0.join(','));
  check('a11y-scan: detecta P1 (main, encabezados, tabindex, ids, reduced-motion, tabla, borde de control)', ['sin-main', 'encabezados', 'tabindex-positivo', 'ids-duplicados', 'sin-reduced-motion', 'tabla-sin-encabezados', 'contraste-ui'].every((x) => ids(j).includes(x)), ids(j).join(','));
  check('a11y-scan: cada hallazgo cita el criterio WCAG', (j.findings || []).every((x) => x.wcag));
  check('a11y-scan: puntaje bajo con muchos P0', j.score < 40, `puntaje ${j.score}`);
  r = run(S('a11y-scan.cjs'), [fx('a11y-mala.html'), '--max-p0', '0']);
  check('a11y-scan: --max-p0 0 sale con 1 si hay P0', r.code === 1);
  r = run(S('a11y-scan.cjs'), [fx('a11y-buena.html'), '--json']);
  check('a11y-scan: la página correcta no tiene hallazgos (sin falsos positivos)', json(r).score === 100 && !(json(r).findings || []).length, ids(json(r)).join(','));
  r = run(S('a11y-scan.cjs'), [fx('Billing.tsx'), '--json']);
  check('a11y-scan: en JSX detecta onClick en un div', ids(json(r)).includes('click-sin-teclado'));

  // Performance
  r = run(S('perf-score.cjs'), [fx('perf-site'), '--json']);
  j = json(r);
  check('perf-score: estático detecta script bloqueante, imágenes sin dimensiones, @import y fuentes sin swap', ['script-bloqueante', 'img-sin-dimensiones', 'css-import', 'google-fonts-sin-display'].every((x) => ids(j).includes(x)), ids(j).join(','));
  check('perf-score: sin --url informa que es una estimación estática', /estimación estática/.test(j.basis || '') && j.score < 90);

  // Plan de trabajo
  const rev = path.join(tmp, 'review');
  fs.mkdirSync(rev, { recursive: true });
  run(S('a11y-scan.cjs'), [fx('a11y-mala.html'), '--out', path.join(rev, 'a11y.json')]);
  run(S('ai-look.cjs'), [fx('generica.html'), '--out', path.join(rev, 'ai-look.json')]);
  run(S('perf-score.cjs'), [fx('perf-site'), '--out', path.join(rev, 'perf.json')]);
  fs.copyFileSync(fx('heuristics.json'), path.join(rev, 'heuristics.json'));
  const all = ['heuristics.json', 'a11y.json', 'ai-look.json', 'perf.json'].map((f) => path.join(rev, f));
  r = run(S('plan.cjs'), [...all, all[1], '--title', 'Prueba', '--out', path.join(rev, 'PLAN.md'), '--issues', path.join(rev, 'issues')]);
  const plan = fs.existsSync(path.join(rev, 'PLAN.md')) ? fs.readFileSync(path.join(rev, 'PLAN.md'), 'utf8') : '';
  check('plan: genera PLAN.md con puntajes y fases', r.code === 0 && /## Puntajes/.test(plan) && /Heurísticas de Nielsen \| 24\/40/.test(plan) && /Fase 1 — Bloqueantes/.test(plan) && /Fase 3 — Pulido/.test(plan));
  check('plan: P0 antes que P1 y criterio de hecho por tarea', plan.indexOf('Fase 1') < plan.indexOf('Fase 2') && (plan.match(/Hecho cuando:/g) || []).length >= 10);
  check('plan: incluye el hallazgo de juicio (heurística) junto a los de los scripts', /No se avisa cuando los datos están desactualizados/.test(plan));
  check('plan: no duplica hallazgos si un informe entra dos veces', (plan.match(/\*\*El documento no declara el idioma\*\*/g) || []).length === 1);
  const cmds = fs.existsSync(path.join(rev, 'issues', 'crear-issues.txt')) ? fs.readFileSync(path.join(rev, 'issues', 'crear-issues.txt'), 'utf8') : '';
  check('plan: --issues deja un cuerpo por paquete y los comandos gh issue create', /gh issue create --title "\[UI P0\]/.test(cmds) && fs.readdirSync(path.join(rev, 'issues')).filter((f) => f.endsWith('.md')).length >= 3);

  // Quiz de estilo
  const st = path.join(tmp, 'style.json');
  r = run(K('style-quiz', 'style.cjs'), ['--preset', 'operar', '--set', 'density=8', 'accent=#0e7c66', '--out', st]);
  let sj = {}; try { sj = JSON.parse(fs.readFileSync(st, 'utf8')); } catch { /* */ }
  check('style-quiz: preset + respuestas escriben style.json completo', r.code === 0 && sj.surface === 'operar' && sj.density === 8 && sj.type === 'tecnica');
  r = run(K('style-quiz', 'style.cjs'), ['--set', 'motion=9', '--out', st]);
  check('style-quiz: conserva lo anterior y avisa fuera del rango de la superficie', r.code === 0 && /AVISO motion=9/.test(r.out) && JSON.parse(fs.readFileSync(st, 'utf8')).density === 8);
  r = run(K('style-quiz', 'style.cjs'), ['--set', 'density=20', '--out', st]);
  check('style-quiz: rechaza valores inválidos', r.code === 1 && /density/.test(r.out));

  // Kit de página
  const pk = path.join(tmp, 'pk');
  fs.mkdirSync(path.join(pk, 'design'), { recursive: true });
  let allOk = true; const det = [];
  for (const sfc of ['operar', 'convencer', 'leer', 'experiencia']) {
    run(K('style-quiz', 'style.cjs'), ['--preset', sfc, '--reset', '--out', path.join(pk, `s-${sfc}.json`)]);
    r = run(K('page-kit', 'page-kit.cjs'), ['--page', sfc, '--style', path.join(pk, `s-${sfc}.json`), '--no-brand', '--out', path.join(pk, 'pages'), '--json']);
    const pj = json(r); if (r.code !== 0 || pj.fails !== 0 || !(pj.pairs || []).length) { allOk = false; det.push(`${sfc}: exit ${r.code}, fallan ${pj.fails}`); }
  }
  check('page-kit: las cuatro superficies generan kits sin pares de contraste fallando', allOk, det.join('; '));
  const kd = path.join(pk, 'pages', 'operar');
  check('page-kit: escribe tokens.css, tokens.json, tailwind.css, specimen.html y kit.md', ['tokens.css', 'tokens.json', 'tailwind.css', 'specimen.html', 'kit.md'].every((f) => fs.existsSync(path.join(kd, f))));
  const tcss = fs.existsSync(path.join(kd, 'tokens.css')) ? fs.readFileSync(path.join(kd, 'tokens.css'), 'utf8') : '';
  check('page-kit: tokens.css con tema oscuro (sistema y data-theme) y reduced-motion', /prefers-color-scheme: dark/.test(tcss) && /:root\[data-theme="dark"\]/.test(tcss) && /prefers-reduced-motion: reduce/.test(tcss) && /--on-accent:/.test(tcss));
  check('page-kit: tailwind.css para v4 con @theme y roles en @theme inline', /@theme \{/.test(fs.readFileSync(path.join(kd, 'tailwind.css'), 'utf8')) && /@theme inline \{[\s\S]*--color-bg: var\(--bg\)/.test(fs.readFileSync(path.join(kd, 'tailwind.css'), 'utf8')));
  let tj = {}; try { tj = JSON.parse(fs.readFileSync(path.join(kd, 'tokens.json'), 'utf8')); } catch { /* */ }
  check('page-kit: tokens.json en formato DTCG', tj.color && tj.color.accent && tj.color.accent['500'].$type === 'color' && tj.role && tj.role.dark);
  const big = path.join(pk, 'pages', 'convencer', 'tokens.css');
  check('page-kit: títulos grandes fluidos con clamp()', fs.existsSync(big) && /--text-4xl: clamp\(/.test(fs.readFileSync(big, 'utf8')));
  fs.writeFileSync(path.join(pk, 'design', 'tokens.css'), ':root { --color-accent: #0e6f7a; --color-text: #1b2430; --font-body: "Marca Sans", system-ui, sans-serif; }\n');
  r = run(K('page-kit', 'page-kit.cjs'), ['--page', 'heredado', '--style', path.join(pk, 's-operar.json'), '--brand', path.join(pk, 'design', 'tokens.css'), '--out', path.join(pk, 'pages')]);
  check('page-kit: hereda acento, texto y fuente de la marca global', r.code === 0 && /Hereda: Acento #0e6f7a/.test(r.out) && /Hereda: Texto #1b2430/.test(r.out) && /Marca Sans/.test(fs.readFileSync(path.join(pk, 'pages', 'heredado', 'tokens.css'), 'utf8')));
  r = run(K('page-kit', 'page-kit.cjs'), ['--page', 'amarillo', '--accent', '#f5c400', '--no-brand', '--style', path.join(pk, 's-operar.json'), '--out', path.join(pk, 'pages'), '--json']);
  check('page-kit: un acento claro usa texto oscuro encima y sigue pasando AA', r.code === 0 && json(r).fails === 0 && /--on-accent: #(?!ffffff)/.test(fs.readFileSync(path.join(pk, 'pages', 'amarillo', 'tokens.css'), 'utf8')));
  r = run(S('a11y-scan.cjs'), [path.join(kd, 'specimen.html'), '--json']);
  check('page-kit: la hoja de muestra no tiene P0 de accesibilidad', json(r).counts && json(r).counts.P0 === 0, ids(json(r)).join(','));
  r = run(S('ai-look.cjs'), [path.join(kd, 'specimen.html'), '--json']);
  check('page-kit: la hoja de muestra no cae en tics de UI generada', json(r).score <= 15, `índice ${json(r).score}`);

  // launch.json
  const mono = path.join(tmp, 'mono');
  for (const d of ['apps/web', 'apps/admin', 'design']) fs.mkdirSync(path.join(mono, d), { recursive: true });
  fs.writeFileSync(path.join(mono, 'package.json'), JSON.stringify({ name: 'mono', private: true, workspaces: ['apps/*'], scripts: { dev: 'turbo dev' } }));
  fs.writeFileSync(path.join(mono, 'pnpm-lock.yaml'), '');
  fs.writeFileSync(path.join(mono, 'apps', 'web', 'package.json'), JSON.stringify({ name: 'web', scripts: { dev: 'next dev -p 3100' }, dependencies: { next: '14' } }));
  fs.writeFileSync(path.join(mono, 'apps', 'admin', 'package.json'), JSON.stringify({ name: 'admin', scripts: { dev: 'vite' }, devDependencies: { vite: '5' } }));
  const LJ = K('preview-setup', 'launch-json.cjs');
  r = run(LJ, ['--dir', mono]);
  let lj = {}; try { lj = JSON.parse(fs.readFileSync(path.join(mono, '.claude', 'launch.json'), 'utf8')); } catch { /* */ }
  const byName = Object.fromEntries((lj.configurations || []).map((c) => [c.name, c]));
  check('launch-json: monorepo con una configuración por app, gestor y puerto detectados', r.code === 0 && lj.version === '0.0.1' && byName.web && byName.web.port === 3100 && byName.web.runtimeExecutable === 'pnpm' && byName.web.cwd === 'apps/web' && byName.admin && byName.admin.port === 5173);
  check('launch-json: agrega los previews de design/ y copia el servidor', byName.design && byName.design.runtimeArgs[0] === 'design/serve.cjs' && fs.existsSync(path.join(mono, 'design', 'serve.cjs')) && byName.web.autoVerify === true);
  run(LJ, ['--dir', mono]);
  check('launch-json: volver a correrlo no duplica configuraciones', JSON.parse(fs.readFileSync(path.join(mono, '.claude', 'launch.json'), 'utf8')).configurations.length === lj.configurations.length);
  fs.writeFileSync(path.join(mono, '.claude', 'launch.json'), '{ // comentario\n "version": "0.0.1" }');
  r = run(LJ, ['--dir', mono]);
  check('launch-json: no toca un archivo con comentarios', r.code === 1 && fs.readFileSync(path.join(mono, '.claude', 'launch.json'), 'utf8').includes('comentario'));

  // Con Playwright: medición de laboratorio, capturas y selector de opciones
  const { loadPlaywright } = require(path.join(FS, 'lib', 'playwright.cjs'));
  if (loadPlaywright()) {
    const fileUrl = (p) => 'file://' + (process.platform === 'win32' ? '/' : '') + p.split(path.sep).join('/');
    r = run(S('perf-score.cjs'), [fx('perf-site'), '--url', fileUrl(fx('perf-site/index.html')), '--json']);
    j = json(r);
    check('perf-score: con --url mide FCP, LCP, TBT y CLS en Chromium', j.lab && j.lab.fcp > 0 && typeof j.lab.cls === 'number' && /laboratorio local/.test(j.basis));
    const sh = path.join(tmp, 'shots');
    const shell = path.join(FS, 'skills', 'ui-options', 'templates', 'options-shell.html');
    r = run(K('preview-setup', 'shots.cjs'), ['before', '--url', fileUrl(shell), '--routes', '#dir-a,#dir-b', '--widths', '390,1280', '--out', sh]);
    const r2 = run(K('preview-setup', 'shots.cjs'), ['after', '--out', sh]);
    const r3 = run(K('preview-setup', 'shots.cjs'), ['compare', '--out', sh]);
    check('shots: antes, después y comparación (sin cambios = 0 %)', r.code === 0 && r2.code === 0 && r3.code === 0 && fs.readdirSync(path.join(sh, 'after')).filter((f) => f.endsWith('.png')).length === 4 && fs.existsSync(path.join(sh, 'compare.html')) && /: 0% cambió/.test(r3.out), r3.out.slice(0, 200));
  } else {
    add('AVISO', 'front-studio: Playwright no está instalado', 'se saltean la medición de laboratorio y las capturas');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
};
