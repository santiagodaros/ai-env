#!/usr/bin/env node
// Genera .claude/launch.json para el panel de preview de la app de escritorio de Claude (pestaña Code).
// Uso: node launch-json.cjs [--dir <raíz-del-repo>] [--app <subcarpeta>] [--port N] [--force] [--dry-run] [--no-design]
// Detecta gestor de paquetes (por lockfile), script de desarrollo (dev, start, preview, serve), framework y puerto.
// En monorepos agrega una configuración por app con script dev. Si existe design/ (front-studio), agrega una para los previews.
// No pisa configuraciones existentes con el mismo nombre salvo --force (y deja .bak). Si el archivo tiene comentarios
// o no es JSON válido, no lo toca.
'use strict';
const fs = require('fs');
const path = require('path');

const FRAMEWORKS = [
  ['next', 3000], ['nuxt', 3000], ['@remix-run/dev', 5173], ['astro', 4321], ['@sveltejs/kit', 5173], ['@angular/core', 4200],
  ['gatsby', 8000], ['react-scripts', 3000], ['parcel', 1234], ['webpack-dev-server', 8080], ['vite', 5173],
];

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function pm(dir) {
  let d = path.resolve(dir);
  for (let i = 0; i < 4; i++) { // en monorepos el lockfile está en la raíz
    if (fs.existsSync(path.join(d, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(d, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(d, 'bun.lockb')) || fs.existsSync(path.join(d, 'bun.lock'))) return 'bun';
    if (fs.existsSync(path.join(d, 'package-lock.json'))) return 'npm';
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  return 'npm';
}

function detectApp(appDir, root, forcedPort) {
  const pkg = readJson(path.join(appDir, 'package.json'));
  if (!pkg || !pkg.scripts) return null;
  const script = ['dev', 'start', 'preview', 'serve'].find((s) => pkg.scripts[s]);
  if (!script) return null;
  const cmd = pkg.scripts[script];
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const fw = FRAMEWORKS.find(([n]) => deps[n] || cmd.includes(n.replace(/^@[\w-]+\//, '')));
  let port = forcedPort || Number((cmd.match(/(?:--port|-p)[ =](\d{2,5})/) || [])[1]) || 0;
  if (!port) {
    for (const f of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'astro.config.mjs']) {
      const t = fs.existsSync(path.join(appDir, f)) ? fs.readFileSync(path.join(appDir, f), 'utf8') : '';
      const m = t.match(/port\s*:\s*(\d{2,5})/); if (m) { port = Number(m[1]); break; }
    }
  }
  if (!port && pkg.scripts[script] && /PORT=(\d+)/.test(cmd)) port = Number(cmd.match(/PORT=(\d+)/)[1]);
  port = port || (fw ? fw[1] : 3000);
  const manager = pm(appDir);
  const args = manager === 'npm' || manager === 'bun' ? ['run', script] : [script];
  const rel = path.relative(root, appDir).split(path.sep).join('/');
  return {
    name: rel ? path.basename(appDir) : (pkg.name || 'app').replace(/^@[\w-]+\//, ''),
    runtimeExecutable: manager,
    runtimeArgs: args,
    port,
    ...(rel ? { cwd: rel } : {}),
    autoVerify: true,
    autoPort: true,
    _why: `${manager} ${args.join(' ')} → "${cmd}"${fw ? ` (${fw[0]})` : ''}`,
  };
}

function workspaces(root) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  let globs = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces && pkg.workspaces.packages) || [];
  const pnpmWs = path.join(root, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmWs)) globs = globs.concat([...fs.readFileSync(pnpmWs, 'utf8').matchAll(/^\s*-\s*["']?([^"'\n]+)["']?/gm)].map((m) => m[1]));
  const dirs = [];
  for (const g of globs) {
    const base = g.replace(/\/\*+$/, '');
    const abs = path.join(root, base);
    if (!fs.existsSync(abs)) continue;
    if (g.endsWith('*')) for (const e of fs.readdirSync(abs, { withFileTypes: true })) { if (e.isDirectory()) dirs.push(path.join(abs, e.name)); }
    else dirs.push(abs);
  }
  return dirs;
}

function main() {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const root = path.resolve(get('--dir') || '.');
  const forcedPort = get('--port') ? Number(get('--port')) : 0;
  const configs = [];
  if (get('--app')) { const c = detectApp(path.join(root, get('--app')), root, forcedPort); if (c) configs.push(c); }
  else {
    const rootApp = detectApp(root, root, forcedPort);
    const ws = workspaces(root).map((d) => detectApp(d, root, 0)).filter(Boolean).filter((c) => c.runtimeArgs.join(' ').match(/\b(dev|start)\b/));
    if (ws.length) {
      configs.push(...ws);
      if (rootApp && !/turbo|nx|lerna|concurrently|run-p/.test(rootApp._why)) configs.unshift(rootApp);
    } else if (rootApp) configs.push(rootApp);
  }
  // Previews de front-studio (design/preview, design/options, design/pages) con el servidor sin dependencias.
  const design = path.join(root, 'design');
  if (!argv.includes('--no-design') && fs.existsSync(design)) {
    const serveFile = path.join(design, 'serve.cjs');
    if (!fs.existsSync(serveFile) && !argv.includes('--dry-run')) fs.copyFileSync(path.join(__dirname, '..', '..', 'live-preview', 'scripts', 'serve.cjs'), serveFile);
    const used = new Set(configs.map((c) => c.port));
    let port = 4173; while (used.has(port)) port++;
    configs.push({ name: 'design', runtimeExecutable: 'node', runtimeArgs: ['design/serve.cjs', 'design', '--port', String(port), '--no-open'], port, autoVerify: true, autoPort: true, _why: 'design/serve.cjs, servidor sin dependencias con recarga (previews, opciones y kits de front-studio)' });
  }
  if (!configs.length) { console.error('No encontré package.json con script dev/start/preview/serve ni carpeta design/. Pasá --app <carpeta> o armá la configuración a mano.'); process.exit(1); }

  const file = path.join(root, '.claude', 'launch.json');
  let current = { version: '0.0.1', configurations: [] };
  if (fs.existsSync(file)) {
    const txt = fs.readFileSync(file, 'utf8');
    try { current = JSON.parse(txt); } catch { console.error(`${file} no es JSON estricto (¿tiene comentarios?). No lo toco: corregilo o borralo y volvé a correr.`); process.exit(1); }
    if (!Array.isArray(current.configurations)) current.configurations = [];
  }
  const report = [];
  for (const c of configs) {
    const why = c._why; delete c._why;
    const i = current.configurations.findIndex((x) => x.name === c.name);
    if (i >= 0 && !argv.includes('--force')) { report.push(`= ${c.name}: ya existe, no se toca (--force para reemplazar)`); continue; }
    if (i >= 0) current.configurations[i] = c; else current.configurations.push(c);
    report.push(`${i >= 0 ? '~' : '+'} ${c.name}: ${c.runtimeExecutable} ${c.runtimeArgs.join(' ')} en el puerto ${c.port}${c.cwd ? ` (cwd ${c.cwd})` : ''} — ${why}`);
  }
  current.version = current.version || '0.0.1';
  const out = JSON.stringify(current, null, 2) + '\n';
  if (argv.includes('--dry-run')) { console.log(report.join('\n')); console.log(out); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && argv.includes('--force')) fs.copyFileSync(file, `${file}.bak`);
  fs.writeFileSync(file, out);
  console.log(`${path.relative(process.cwd(), file) || file}:`);
  console.log(report.join('\n'));
}

if (require.main === module) main();
module.exports = { detectApp, pm };
