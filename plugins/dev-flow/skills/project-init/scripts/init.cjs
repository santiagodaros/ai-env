#!/usr/bin/env node
// Aplicación segura e idempotente de lo que project-init puede hacer sin criterio humano. Nunca pisa texto existente.
// Uso: node init.cjs [--dir <repo>] [--apply] [--settings] [--ci] [--agents]   (sin --apply muestra qué haría)
//   --agents    forma de trabajo Tech Lead + workers: .claude/dev-flow.json, docs/PRD.md, docs/ESTADO.md,
//               docs/CHANGELOG.md, bloque de CLAUDE.md, .claude/prompts/ y .worktreeinclude (nada se pisa)
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
if (read('docs/STATE.md') === null && !argv.includes('--agents') && read('docs/ESTADO.md') === null) act('crear docs/STATE.md', () => { fs.mkdirSync(path.join(dir, 'docs'), { recursive: true }); fs.writeFileSync(path.join(dir, 'docs', 'STATE.md'), '# STATE\n\nEstado vivo del proyecto. El hook rehydrate lo reinyecta tras /compact.\n\n## Decisiones\n- \n\n## Hecho\n- \n\n## Pendiente\n- \n'); });
// .gitignore
const want = ['.claude/.feature-flow/', '.claude/worktrees/', '.dev-flow/', '.claude/settings.local.json', 'CLAUDE.local.md', '.private-terms', 'tfplan', '*.tfplan', 'plan.json', 'whatif.json'];
const gi = read('.gitignore') || '';
const miss = want.filter(w => !gi.split(/\r?\n/).includes(w));
if (miss.length) act(`agregar a .gitignore: ${miss.join(', ')}`, () => fs.appendFileSync(path.join(dir, '.gitignore'), (gi && !gi.endsWith('\n') ? '\n' : '') + '# Claude Code: estado local\n' + miss.join('\n') + '\n'));
// Forma de trabajo Tech Lead + workers (orquestador headless, PRD como fuente de verdad, GitHub como bus)
const agentsBlock = ['<!-- agents:start -->', '## Forma de trabajo: Tech Lead y workers',
  '- La sesión principal es el **Tech Lead**: analiza, parte en tickets (`/dev-flow:prd`, `/dev-flow:ticket`), lanza workers (`/dev-flow:dispatch`) y audita. No escribe código de aplicación.',
  '- Fuente de verdad: `docs/PRD.md`, con ids estables (`## [F-03] ...`). Ningún worker recibe el PRD completo: recibe el issue con su rebanada.',
  '- Workers efímeros y en frío: `implementer`, `auditor`, `sre`, `docs`. Cada uno en su worktree y su rama (`feat/<N>-<slug>`, `fix/<N>-<slug>`), un ticket por vez.',
  '- El estado vive en GitHub (issues, PRs con `Closes #N`, checks) y en `docs/ESTADO.md` (`estado.cjs --write`); el historial, en `docs/CHANGELOG.md`.',
  '- Zero-trust: quien implementa no audita. El implementador entrega la tarjeta (JSON validado); el auditor, sin permiso de edición, devuelve un veredicto. Las pruebas tienen que fallar sin el cambio (`test-honesty`).',
  '- Merge: lo decide una persona, con veredicto `aprobar` y checks verdes.',
  '- Reglas del proyecto para cada rol: `.claude/prompts/<rol>.md` (se suman a las del plugin).',
  '<!-- agents:end -->', ''].join('\n');
if (argv.includes('--agents')) {
  const cfgF = path.join(dir, '.claude', 'dev-flow.json');
  if (!fs.existsSync(cfgF)) act('crear .claude/dev-flow.json (PRD, ESTADO, worktrees en ~/worktrees, topes para workers)', () => { fs.mkdirSync(path.dirname(cfgF), { recursive: true }); fs.writeFileSync(cfgF, JSON.stringify({ prd: 'docs/PRD.md', state: 'docs/ESTADO.md', worktrees: { root: '~/worktrees' }, launch: { maxConcurrent: 3, maxPerDay: 12, cooldownMinutes: 2 }, workers: { mode: 'headless', permissionMode: 'auto', maxTurns: 80 } }, null, 2) + '\n'); });
  if (read('docs/PRD.md') === null) act('crear docs/PRD.md con el esqueleto (G-01, G-02, NF-01, F-01)', () => { fs.mkdirSync(path.join(dir, 'docs'), { recursive: true }); fs.writeFileSync(path.join(dir, 'docs', 'PRD.md'), require('../../prd/scripts/prd.cjs').SKELETON); });
  if (read('docs/ESTADO.md') === null) act('crear docs/ESTADO.md con el bloque generado (estado.cjs --write lo completa desde GitHub)', () => { fs.mkdirSync(path.join(dir, 'docs'), { recursive: true }); fs.writeFileSync(path.join(dir, 'docs', 'ESTADO.md'), '# Estado\n\n## Decisiones\n- \n\n## Estado generado\n\n<!-- estado:start -->\n(correr estado.cjs --write)\n<!-- estado:end -->\n'); });
  if (read('docs/CHANGELOG.md') === null) act('crear docs/CHANGELOG.md', () => { fs.mkdirSync(path.join(dir, 'docs'), { recursive: true }); fs.writeFileSync(path.join(dir, 'docs', 'CHANGELOG.md'), '# Historial de cambios\n\n## Sin publicar\n'); });
  if (!fs.existsSync(path.join(dir, '.claude', 'prompts'))) act('crear .claude/prompts/ con una plantilla por rol (reglas del proyecto, vacías)', () => {
    const pd = path.join(dir, '.claude', 'prompts'); fs.mkdirSync(pd, { recursive: true });
    for (const r of ['implementer', 'auditor', 'sre', 'docs']) fs.writeFileSync(path.join(pd, `${r}.md`), `# Reglas del proyecto para el rol ${r}\n\nSe suman a las del plugin dev-flow (no las reemplazan). Solo lo propio de este repo: convenciones, carpetas prohibidas, comandos especiales.\n\n- \n`);
  });
  if (read('.worktreeinclude') === null) act('crear .worktreeinclude (archivos ignorados por git que se copian a cada worktree; vacío por defecto)', () => fs.writeFileSync(path.join(dir, '.worktreeinclude'), '# Un patrón por línea, como .gitignore. Ojo: lo que pongas acá (p. ej. .env) se copia a cada worktree.\n# .env\n'));
  const cm0 = read('CLAUDE.md');
  if (cm0 === null || !cm0.includes('<!-- agents:start -->')) act('agregar a CLAUDE.md el bloque "Forma de trabajo: Tech Lead y workers"', () => { const cur = read('CLAUDE.md'); fs.writeFileSync(path.join(dir, 'CLAUDE.md'), cur === null ? `# ${path.basename(dir)}\n\n${agentsBlock}` : cur + (cur.endsWith('\n') ? '\n' : '\n\n') + agentsBlock); });
}

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
    for (const p of ['guard@ai-env', 'arch@ai-env', 'dev-flow@ai-env']) if (!(p in next.enabledPlugins)) next.enabledPlugins[p] = true;
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
