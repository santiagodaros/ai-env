#!/usr/bin/env node
// Aplicación segura e idempotente de lo que project-init puede hacer sin criterio humano. Nunca pisa texto existente.
// Uso: node init.cjs [--dir <repo>] [--apply] [--settings] [--ci]   (sin --apply muestra qué haría)
//   --settings  declara el marketplace ai-env y activa guard + dev-flow en .claude/settings.json (para todo el que clone el repo)
//   --ci        agrega los workflows de arquitectura y seguridad y dependabot, si no existen
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2);
const dir = path.resolve(argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : process.cwd());
const apply = argv.includes('--apply');
const read = f => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return null; } };
const todo = [];
const act = (msg, fn) => { todo.push(msg); if (apply) fn(); };

// docs/STATE.md
if (read('docs/STATE.md') === null) act('crear docs/STATE.md', () => { fs.mkdirSync(path.join(dir, 'docs'), { recursive: true }); fs.writeFileSync(path.join(dir, 'docs', 'STATE.md'), '# STATE\n\nEstado vivo del proyecto. El hook rehydrate lo reinyecta tras /compact.\n\n## Decisiones\n- \n\n## Hecho\n- \n\n## Pendiente\n- \n'); });
// .gitignore
const want = ['.claude/.feature-flow/', '.claude/settings.local.json', 'CLAUDE.local.md', '.private-terms'];
const gi = read('.gitignore') || '';
const miss = want.filter(w => !gi.split(/\r?\n/).includes(w));
if (miss.length) act(`agregar a .gitignore: ${miss.join(', ')}`, () => fs.appendFileSync(path.join(dir, '.gitignore'), (gi && !gi.endsWith('\n') ? '\n' : '') + '# Claude Code: estado local\n' + miss.join('\n') + '\n'));
// CLAUDE.md: bloque de comandos con scripts reales
let pkg = {}; try { pkg = JSON.parse(read('package.json') || '{}'); } catch { /* sin package.json */ }
const pm = fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : 'npm';
const real = ['dev', 'build', 'typecheck', 'lint', 'test'].filter(s => pkg.scripts && pkg.scripts[s]);
const missing = ['typecheck', 'lint', 'test'].filter(s => !real.includes(s));
const block = ['<!-- commands:start -->', '## Comandos', ...real.map(s => `- ${s}: \`${pm} run ${s}\``), ...(real.length ? [] : ['- (no hay package.json con scripts: completar a mano)']), ...(missing.length && real.length ? [`- Faltan scripts: ${missing.join(', ')}. \`stop-verify\` y \`feature-close\` no pueden verificar lo que no existe.`] : []), '<!-- commands:end -->', ''].join('\n');
const cm = read('CLAUDE.md');
if (cm === null) act('crear CLAUDE.md con el bloque de comandos', () => fs.writeFileSync(path.join(dir, 'CLAUDE.md'), `# ${path.basename(dir)}\n\n${block}`));
else if (!cm.includes('<!-- commands:start -->')) act('agregar el bloque de comandos al final de CLAUDE.md', () => fs.appendFileSync(path.join(dir, 'CLAUDE.md'), (cm.endsWith('\n') ? '\n' : '\n\n') + block));
// .claude/settings.json: plugins del repo (solo agrega lo que falta; nunca quita ni pisa)
if (argv.includes('--settings')) {
  const sf = path.join(dir, '.claude', 'settings.json');
  let cur = {}, ok = true;
  if (fs.existsSync(sf)) { try { cur = JSON.parse(fs.readFileSync(sf, 'utf8')); } catch { ok = false; todo.push('.claude/settings.json no es JSON válido: no se toca'); } }
  if (ok) {
    const next = JSON.parse(JSON.stringify(cur));
    next.extraKnownMarketplaces = next.extraKnownMarketplaces || {};
    if (!next.extraKnownMarketplaces['ai-env']) next.extraKnownMarketplaces['ai-env'] = { source: { source: 'github', repo: 'santiagodaros/ai-env' }, autoUpdate: true };
    next.enabledPlugins = next.enabledPlugins || {};
    for (const p of ['guard@ai-env', 'dev-flow@ai-env']) if (!(p in next.enabledPlugins)) next.enabledPlugins[p] = true;
    if (JSON.stringify(next) !== JSON.stringify(cur)) act('declarar el marketplace ai-env y activar guard y dev-flow en .claude/settings.json', () => { fs.mkdirSync(path.dirname(sf), { recursive: true }); fs.writeFileSync(sf, JSON.stringify(next, null, 2) + '\n'); });
  }
}
// CI: workflows y dependabot desde las plantillas
if (argv.includes('--ci')) {
  const T = path.join(__dirname, '..', 'templates', 'github');
  for (const f of ['workflows/architecture.yml', 'workflows/security.yml', 'dependabot.yml']) {
    if (read('.github/' + f) === null) act(`crear .github/${f}`, () => { fs.mkdirSync(path.dirname(path.join(dir, '.github', f)), { recursive: true }); fs.copyFileSync(path.join(T, f), path.join(dir, '.github', f)); });
  }
}
console.log((apply ? 'Aplicado:\n' : 'Haría (usá --apply):\n') + (todo.length ? todo.map(t => '- ' + t).join('\n') : '- nada: el repo ya tiene todo esto'));
