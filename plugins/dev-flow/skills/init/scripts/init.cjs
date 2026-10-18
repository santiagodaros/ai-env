#!/usr/bin/env node
// /dev-flow:init. Misma forma que el init de Pignolo:
//   detect                          solo lee: qué hay, qué preguntar, qué pasos se recomiendan y a qué prestar atención
//   preview --plan <archivo>        no escribe: qué haría cada paso aprobado, y un `stamp` (huella del plan + estado del repo)
//   apply --plan <archivo> --expect <stamp>
//                                   escribe solo los pasos aprobados; se niega (stale-preview) si el plan o el repo cambiaron
//   verify                          revisa que lo escrito quedó válido (JSON que parsea, .private-terms ignorado, bloques)
// Plan: {"v":1,"approved":["gitignore","claude-md",...],"answers":{"mode":"features|tech-lead","profile":"core|app|cloud|frontend|full","share":true,"privateTerms":["..."]}}
// JSON por stdout. Exit 0 ok · 1 fallo con `kind` ("Alternativa:" en stderr) · 2 uso incorrecto · 3 quedó a medias.
// Nunca pisa texto existente (agrega o crea), respalda lo que modifica fuera del repo, nunca commitea ni hace push.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { detect: detectStack } = require('./detect.cjs');

const STEP_IDS = ['gitignore', 'gitattributes', 'editorconfig', 'private-terms', 'claude-md', 'state', 'hygiene-plan', 'tech-lead', 'settings', 'ci', 'git-hook'];
const GH = require('../../../lib/git-hook.cjs');
const T = path.join(__dirname, '..', 'templates');
const GITIGNORE = ['.claude/.feature-flow/', '.claude/worktrees/', '.dev-flow/', '.claude/settings.local.json', 'CLAUDE.local.md', '.private-terms', 'tfplan', '*.tfplan', 'plan.json', 'whatif.json'];
const PROFILES = require('../../../lib/profiles.json'); // copia de shared/profiles.json
const MK = PROFILES.marketplace;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

class Usage extends Error {}
class Fail extends Error { constructor(kind, message, alt) { super(message); this.kind = kind; this.alt = alt; } }

function parse(argv) {
  const verb = argv[0];
  if (!['detect', 'preview', 'apply', 'verify'].includes(verb)) throw new Usage('uso: init.cjs detect | preview --plan <archivo> | apply --plan <archivo> --expect <stamp> | verify   [--dir <repo>]');
  const o = { verb };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (!['--plan', '--dir', '--expect'].includes(a)) throw new Usage(`opción desconocida: ${a}`);
    if (argv[i + 1] === undefined) throw new Usage(`${a} necesita un valor`);
    o[a.slice(2)] = argv[(i += 1)];
  }
  if (o.expect !== undefined && verb !== 'apply') throw new Usage('--expect solo vale con apply');
  if ((verb === 'preview' || verb === 'apply') && !o.plan) throw new Usage(`${verb} necesita --plan <archivo>`);
  if (verb === 'apply' && !o.expect) throw new Usage('apply exige --expect <stamp> (el que dio preview): no se escribe nada que no se haya mostrado antes');
  return o;
}

function repoRoot(dir) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Fail('not-a-repo', `${dir} no es un repositorio git`, 'corré `git init` y volvé a correr /dev-flow:init');
  return path.resolve(r.stdout.trim());
}

function readPlan(file) {
  let p;
  try { p = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Usage(`no pude leer el plan ${file}: ${e.message}`); }
  if (!p || p.v !== 1 || !Array.isArray(p.approved)) throw new Usage('el plan necesita {"v":1,"approved":[...],"answers":{...}}');
  const bad = p.approved.filter((s) => !STEP_IDS.includes(s));
  if (bad.length) throw new Usage(`pasos desconocidos: ${bad.join(', ')} (válidos: ${STEP_IDS.join(', ')})`);
  const answers = p.answers || {};
  if (answers.mode !== undefined && !['features', 'tech-lead'].includes(answers.mode)) throw new Usage('answers.mode es "features" o "tech-lead"');
  if (answers.privateTerms !== undefined && (!Array.isArray(answers.privateTerms) || answers.privateTerms.some((t) => typeof t !== 'string'))) throw new Usage('answers.privateTerms es una lista de textos');
  if (answers.profile !== undefined && !PROFILES.order.includes(answers.profile)) throw new Usage(`answers.profile es uno de: ${PROFILES.order.join(', ')}`);
  if (answers.share !== undefined && typeof answers.share !== 'boolean') throw new Usage('answers.share es true o false');
  return { approved: STEP_IDS.filter((s) => p.approved.includes(s)), answers: { mode: answers.mode || 'features', profile: answers.profile || null, share: answers.share !== false, privateTerms: (answers.privateTerms || []).map((t) => t.trim()).filter(Boolean) } };
}

// Sistema de archivos simulado: cada paso planea contra el estado que dejan los anteriores, así preview y apply coinciden.
function overlay(root) {
  const mem = new Map();
  const abs = (f) => (path.isAbsolute(f) ? f : path.join(root, f));
  return {
    read(f) { if (mem.has(f)) return mem.get(f); try { return fs.readFileSync(abs(f), 'utf8'); } catch { return null; } },
    write(f, t) { mem.set(f, t); },
  };
}

const ignoredByGit = (root, f) => spawnSync('git', ['check-ignore', '-q', f], { cwd: root }).status === 0;

function commandsBlock(det) {
  const pm = (det.packageManager || 'npm').split(' ')[0];
  const real = ['dev', 'build', 'typecheck', 'lint', 'test'].filter((s) => det.scripts.includes(s));
  const missing = ['typecheck', 'lint', 'test'].filter((s) => !real.includes(s));
  return ['<!-- commands:start -->', '## Comandos', ...real.map((s) => `- ${s}: \`${pm} run ${s}\``),
    ...(real.length ? [] : ['- (no hay package.json con scripts: completar a mano)']),
    ...(missing.length && real.length ? [`- Faltan scripts: ${missing.join(', ')}. \`stop-verify\` y \`feature-close\` no pueden verificar lo que no existe.`] : []),
    '<!-- commands:end -->', ''].join('\n');
}

const STATE_TEMPLATE = '# STATE\n\nEstado vivo del proyecto. Al arrancar una sesión, el hook rehydrate muestra el siguiente paso y los bloqueos; tras /compact, todo.\n\n## Siguiente paso\n- \n\n## Bloqueos\n- \n\n## Decisiones\n- \n\n## Hecho\n- \n\n## Pendiente\n- \n';
// Forma de trabajo para Claude en este repo: corta y con lo que más pesa primero. Es lo único que se lee en cada
// sesión aunque los plugins estén apagados; el resto vive en los archivos a los que apunta.
function harnessBlock(det, stateRel) {
  const pm = (det.packageManager || 'npm').split(' ')[0];
  const checks = ['typecheck', 'lint', 'test'].filter((s) => det.scripts.includes(s)).map((s) => `${pm} run ${s}`);
  return ['<!-- harness:start -->', '## Cómo trabajar en este repo',
    `- **Al empezar:** leé \`${stateRel}\` (siguiente paso y bloqueos), mirá \`git status\` y corré la verificación. Si ya está en rojo, eso se arregla primero.`,
    `- **Verificación:** ${checks.length ? `\`${checks.join(' && ')}\`` : 'no hay scripts todavía (ver la higiene pendiente en el STATE)'}.`,
    '- **Terminado** = la verificación da 0 y la evidencia (comando y resultado) queda en el STATE o en la tarjeta. Que el código parezca bien no cuenta.',
    '- **Una feature activa a la vez.** Tocá solo lo que pide la tarea; lo que veas mal afuera, anotalo en el STATE, no lo arregles.',
    `- **Antes de cerrar:** ${stateRel} con lo hecho, el siguiente paso y los bloqueos; sin \`debugger\`, \`.only\` ni archivos temporales; árbol commiteado o el pendiente anotado.`,
    '- **Nunca:** secretos, IDs de tenant ni nombres de `.private-terms` en archivos versionados; acciones destructivas sin confirmación.',
    `- **Dónde está cada cosa:** \`${stateRel}\` (estado) · \`docs/PRD.md\` (qué construir, si existe) · \`docs/decisions/\` (por qué).`,
    '<!-- harness:end -->', ''].join('\n');
}

const STATE_GENERATED = '\n## Estado generado desde GitHub\n\n<!-- estado:start -->\n(correr estado.cjs --write)\n<!-- estado:end -->\n';

const AGENTS_BLOCK = ['<!-- agents:start -->', '## Forma de trabajo: Tech Lead y workers', '',
  '@AGENTS.md', '',
  '- Esta sesión es el **Tech Lead**: analiza, parte en tickets (`/dev-flow:prd`, `/dev-flow:ticket`), lanza workers (`/dev-flow:dispatch`) y audita. No edita código de aplicación (el hook `lead-guard` lo impide en el checkout principal).',
  '- Estado en GitHub (issues, PRs con `Closes #N`, checks) y en `docs/STATE.md` (bloque generado con `estado.cjs --write`); el hilo de cada ticket, en `.dev-flow/tickets/<N>/` y, al cerrarlo, en `docs/tickets/<N>.md`.',
  '- Merge: lo decide una persona, con veredicto `aprobar` y checks verdes.',
  '<!-- agents:end -->', ''].join('\n');

// Lo que el arnés necesita y el repo no tiene: se muestra como "faltan para el arnés" y lo anota hygiene-plan.
function harnessGaps(det) {
  if (det.blank || det.packageManager === null) return [];
  const g = [];
  if (!det.scripts.includes('test')) g.push({ id: 'test', text: 'script `test`: sin él no hay compuerta de pruebas (quick-fix, feature-close, workers)' });
  else if (det.testPlaceholder) g.push({ id: 'test', text: 'script `test` de relleno: no prueba nada; reemplazarlo por el runner real' });
  if (det.testWatch) g.push({ id: 'test-watch', text: `script \`test\` en modo watch (${det.testWatch}): ai-env corre las pruebas con CI=1, pero conviene que el script termine solo` });
  if (!det.scripts.includes('lint')) g.push({ id: 'lint', text: 'script `lint`: stop-verify no puede frenar errores de estilo o bugs obvios' });
  if (det.languages.includes('ts') && !det.scripts.includes('typecheck')) g.push({ id: 'typecheck', text: 'script `typecheck` (tsc --noEmit): stop-verify no ve errores de tipos' });
  if (det.needsBuild && !det.scripts.includes('build')) g.push({ id: 'build', text: 'script `build`: no se verifica que el proyecto compile antes del PR' });
  return g;
}

const GITATTRIBUTES = '# Fines de línea: el repo guarda LF y cada sistema trabaja con el suyo. Lo creó /dev-flow:init.\n# Si ya había archivos con CRLF commiteados, normalizarlos es un commit aparte: git add --renormalize .\n* text=auto\n*.sh text eol=lf\n*.cmd text eol=crlf\n*.bat text eol=crlf\n';
function editorconfigOf(det) {
  const L = ['# Lo creó /dev-flow:init con lo que ya usa el repo. https://editorconfig.org', 'root = true', '', '[*]', 'charset = utf-8', 'insert_final_newline = true', 'trim_trailing_whitespace = true'];
  const groups = {};
  for (const [ext, v] of Object.entries(det.indent || {})) { const k = v.style === 'tab' ? 'tab' : `space${v.size}`; (groups[k] = groups[k] || []).push(ext); }
  for (const [k, exts] of Object.entries(groups).sort()) L.push('', exts.length > 1 ? `[*.{${exts.sort().join(',')}}]` : `[*.${exts[0]}]`, ...(k === 'tab' ? ['indent_style = tab'] : ['indent_style = space', `indent_size = ${k.slice(5)}`]));
  L.push('', '[*.md]', 'trim_trailing_whitespace = false');
  return L.join('\n') + '\n';
}

const appendText = (cur, block) => (cur === null || cur === '' ? block : cur + (cur.endsWith('\n') ? '\n' : '\n\n') + block);

// Cada paso devuelve { status: 'would-do'|'nothing'|'refused', reason?, actions: [{ path, op, desc, content }] }.
// op: create (no existía) · append (agrega al final) · merge (reescribe un JSON agregando claves; se respalda antes).
const STEPS = {
  gitignore(ctx) {
    const cur = ctx.fs.read('.gitignore') || '';
    const miss = GITIGNORE.filter((w) => !cur.split(/\r?\n/).includes(w));
    if (!miss.length) return { status: 'nothing', reason: '.gitignore ya cubre el estado local' };
    const content = (cur && !cur.endsWith('\n') ? '\n' : '') + '# Claude Code: estado local\n' + miss.join('\n') + '\n';
    return { status: 'would-do', actions: [{ path: '.gitignore', op: cur ? 'append' : 'create', desc: `ignorar ${miss.join(', ')}`, content: cur ? content : content.replace(/^\n/, '') }] };
  },
  gitattributes(ctx) {
    if (ctx.fs.read('.gitattributes') !== null) return { status: 'nothing', reason: '.gitattributes ya existe: se respeta tal cual' };
    return { status: 'would-do', actions: [{ path: '.gitattributes', op: 'create', desc: 'fines de línea: * text=auto (LF en el repo, el nativo al trabajar), .sh en LF y .cmd/.bat en CRLF. No renormaliza nada', content: GITATTRIBUTES }] };
  },
  editorconfig(ctx) {
    if (ctx.fs.read('.editorconfig') !== null) return { status: 'nothing', reason: '.editorconfig ya existe: se respeta tal cual' };
    const n = Object.keys(ctx.det.indent || {}).length;
    return { status: 'would-do', actions: [{ path: '.editorconfig', op: 'create', desc: `utf-8, línea final y sin espacios sobrantes${n ? `; indentación detectada en ${n} tipo(s) de archivo` : '; sin indentación (no se pudo detectar con certeza)'}`, content: editorconfigOf(ctx.det) }] };
  },
  'private-terms'(ctx) {
    const terms = ctx.answers.privateTerms;
    if (!terms.length) return { status: 'nothing', reason: 'sin términos privados en las respuestas' };
    const short = terms.filter((t) => t.length < 3);
    if (short.length) return { status: 'refused', reason: `términos demasiado cortos (${short.length}): coincidirían con texto común; usá 3 caracteres o más` };
    const gi = (ctx.fs.read('.gitignore') || '').split(/\r?\n/);
    if (!gi.includes('.private-terms') && !ignoredByGit(ctx.root, '.private-terms')) return { status: 'refused', reason: '.private-terms no está ignorado por git: aprobá también el paso gitignore' };
    const cur = ctx.fs.read('.private-terms');
    const have = new Set((cur || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
    const add = terms.filter((t) => !have.has(t));
    if (!add.length) return { status: 'nothing', reason: '.private-terms ya tiene esos términos' };
    const head = cur === null ? '# Términos que no pueden aparecer en archivos versionados (clientes, tenants). Local: está en .gitignore.\n' : (cur.endsWith('\n') ? '' : '\n');
    return { status: 'would-do', actions: [{ path: '.private-terms', op: cur === null ? 'create' : 'append', desc: `${add.length} término(s) privado(s) en un archivo local que git ignora (feature-close lo usa para frenar fugas)`, content: head + add.join('\n') + '\n', secret: true }] };
  },
  'claude-md'(ctx) {
    const cur = ctx.fs.read('CLAUDE.md');
    const stateRel = ctx.fs.read('docs/STATE.md') === null && ctx.fs.read('docs/ESTADO.md') !== null ? 'docs/ESTADO.md' : 'docs/STATE.md';
    const hasCmd = cur !== null && cur.includes('<!-- commands:start -->');
    const hasHarness = cur !== null && cur.includes('<!-- harness:start -->');
    if (hasCmd && hasHarness) return { status: 'nothing', reason: 'CLAUDE.md ya tiene la forma de trabajo y los comandos' };
    const block = [hasHarness ? '' : harnessBlock(ctx.det, stateRel), hasCmd ? '' : commandsBlock(ctx.det)].filter(Boolean).join('\n');
    const what = [!hasHarness && 'la forma de trabajo (arranque, terminado, alcance, cierre)', !hasCmd && 'los comandos reales'].filter(Boolean).join(' y ');
    return { status: 'would-do', actions: [{ path: 'CLAUDE.md', op: cur === null ? 'create' : 'append', desc: cur === null ? `crear CLAUDE.md con ${what}` : `agregar al final de CLAUDE.md ${what} (tu texto queda igual)`, content: cur === null ? `# ${path.basename(ctx.root)}\n\n${block}` : appendText(cur, block).slice(cur.length) }] };
  },
  state(ctx) {
    // Un solo archivo de estado para los dos modos: docs/STATE.md. En modo Tech Lead lleva además el bloque que
    // estado.cjs --write genera desde GitHub. Un repo que ya usa docs/ESTADO.md (nombre anterior) se respeta.
    const tl = ctx.answers.mode === 'tech-lead';
    const cur = ctx.fs.read('docs/STATE.md');
    if (cur === null && ctx.fs.read('docs/ESTADO.md') !== null) return { status: 'nothing', reason: 'el repo usa docs/ESTADO.md (nombre anterior): se sigue leyendo y escribiendo ahí; para unificar, git mv docs/ESTADO.md docs/STATE.md' };
    if (cur === null) return { status: 'would-do', actions: [{ path: 'docs/STATE.md', op: 'create', desc: `crear docs/STATE.md (el hook rehydrate lo reinyecta tras /compact${tl ? '; con el bloque que estado.cjs completa desde GitHub' : ''})`, content: STATE_TEMPLATE + (tl ? STATE_GENERATED : '') }] };
    if (tl && !cur.includes('<!-- estado:start -->')) return { status: 'would-do', actions: [{ path: 'docs/STATE.md', op: 'append', desc: 'agregar a docs/STATE.md el bloque que estado.cjs completa desde GitHub (lo tuyo queda igual)', content: (cur.endsWith('\n') ? '' : '\n') + STATE_GENERATED }] };
    return { status: 'nothing', reason: 'docs/STATE.md ya está' };
  },
  'hygiene-plan'(ctx) {
    const gaps = harnessGaps(ctx.det);
    if (!gaps.length) return { status: 'nothing', reason: 'no faltan scripts para el arnés' };
    const cur = ctx.fs.read('docs/STATE.md');
    if (cur === null) return { status: 'refused', reason: 'docs/STATE.md no existe: aprobá también el paso state (o usá docs/ESTADO.md)' };
    if (cur.includes('<!-- hygiene:start -->')) return { status: 'nothing', reason: 'docs/STATE.md ya tiene el plan de higiene' };
    const block = ['<!-- hygiene:start -->', '## Higiene para el arnés (pendiente)', '', 'Primera feature sugerida, en su propia rama. No se generan scripts ni dependencias solos: es decisión de la persona.', '', ...gaps.map((g) => `- [ ] ${g.text}`), '<!-- hygiene:end -->', ''].join('\n');
    return { status: 'would-do', actions: [{ path: 'docs/STATE.md', op: 'append', desc: `anotar en docs/STATE.md lo que falta para el arnés (${gaps.map((g) => g.id).join(', ')}) como primera feature`, content: appendText(cur, block).slice(cur.length) }] };
  },
  'tech-lead'(ctx) {
    if (ctx.answers.mode !== 'tech-lead') return { status: 'refused', reason: 'el paso tech-lead necesita answers.mode = "tech-lead"' };
    const A = [];
    const create = (f, desc, content) => { if (ctx.fs.read(f) === null) A.push({ path: f, op: 'create', desc, content }); };
    create('.claude/dev-flow.json', 'configuración del repo: PRD, lead-guard activo, worktrees en ~/worktrees, topes para workers', JSON.stringify({ prd: 'docs/PRD.md', lead: { enforce: true }, worktrees: { root: '~/worktrees' }, launch: { maxConcurrent: 3, maxPerDay: 12, cooldownMinutes: 2 }, workers: { mode: 'headless', permissionMode: 'auto', maxTurns: 80 } }, null, 2) + '\n');
    create('docs/PRD.md', 'PRD con el esqueleto de ids (G-01, G-02, NF-01, F-01)', require('../../prd/scripts/prd.cjs').SKELETON);
    create('docs/CHANGELOG.md', 'historial de cambios', '# Historial de cambios\n\n## Sin publicar\n');
    for (const r of ['implementer', 'auditor', 'sre', 'docs']) create(`.claude/prompts/${r}.md`, `reglas del proyecto para el rol ${r} (vacías)`, `# Reglas del proyecto para el rol ${r}\n\nSe suman a las del plugin dev-flow (no las reemplazan). Solo lo propio de este repo: convenciones, carpetas prohibidas, comandos especiales.\n\n- \n`);
    for (const f of ['AGENTS.md', 'docs/conventions.md', 'docs/verification.md']) create(f, f === 'AGENTS.md' ? 'mapa del repo para agentes (CLAUDE.md lo importa)' : `plantilla de ${path.basename(f, '.md') === 'conventions' ? 'convenciones' : 'verificación'} que el auditor chequea`, fs.readFileSync(path.join(T, 'agents', f), 'utf8'));
    create('.worktreeinclude', 'archivos ignorados que se copian a cada worktree (vacío por defecto)', '# Un patrón por línea, como .gitignore. Ojo: lo que pongas acá (p. ej. .env) se copia a cada worktree.\n# .env\n');
    const cm = ctx.fs.read('CLAUDE.md');
    if (cm === null || !cm.includes('<!-- agents:start -->')) A.push({ path: 'CLAUDE.md', op: cm === null ? 'create' : 'append', desc: 'agregar a CLAUDE.md el bloque "Forma de trabajo: Tech Lead y workers"', content: cm === null ? `# ${path.basename(ctx.root)}\n\n${AGENTS_BLOCK}` : appendText(cm, AGENTS_BLOCK).slice(cm.length) });
    return A.length ? { status: 'would-do', actions: A } : { status: 'nothing', reason: 'el repo ya tiene la forma de trabajo Tech Lead' };
  },
  settings(ctx) {
    // Perfil por repo: activa los plugins del perfil y apaga los demás solo en este repo. Compartido →
    // .claude/settings.json (versionado); si no → .claude/settings.local.json (ignorado). Una clave que ya existe
    // no se toca: se informa como conflicto. Sin perfil (planes viejos): activa core y no apaga nada.
    const f = ctx.answers.share ? '.claude/settings.json' : '.claude/settings.local.json';
    if (!ctx.answers.share) {
      const gi = (ctx.fs.read('.gitignore') || '').split(/\r?\n/);
      if (!gi.includes('.claude/settings.local.json') && !ignoredByGit(ctx.root, f)) return { status: 'refused', reason: '.claude/settings.local.json no está ignorado por git: aprobá también el paso gitignore' };
    }
    const raw = ctx.fs.read(f);
    let cur = {};
    if (raw !== null) { try { cur = JSON.parse(raw); } catch { return { status: 'refused', reason: `${f} no es JSON válido: no se toca` }; } }
    const next = JSON.parse(JSON.stringify(cur));
    next.extraKnownMarketplaces = next.extraKnownMarketplaces || {};
    if (!next.extraKnownMarketplaces[MK]) next.extraKnownMarketplaces[MK] = { source: { source: 'github', repo: 'santiagodaros/ai-env' }, autoUpdate: true };
    next.enabledPlugins = next.enabledPlugins || {};
    const prof = ctx.answers.profile;
    const want = prof ? PROFILES.profiles[prof].plugins : PROFILES.profiles.core.plugins;
    const on = [], off = [], conflicts = [];
    for (const p of PROFILES.profiles.full.plugins) {
      const key = `${p}@${MK}`;
      const desired = want.includes(p) ? true : prof ? false : undefined;
      if (desired === undefined) continue;
      if (key in next.enabledPlugins) { if (next.enabledPlugins[key] !== desired) conflicts.push(`${key} ya está en ${next.enabledPlugins[key]} en ${f}: se respeta`); continue; }
      next.enabledPlugins[key] = desired;
      (desired ? on : off).push(p);
    }
    if (JSON.stringify(next) === JSON.stringify(cur)) return { status: 'nothing', reason: `${f} ya refleja ${prof ? `el perfil ${prof}` : 'los plugins base'}`, ...(conflicts.length ? { conflicts } : {}) };
    const what = [on.length ? `activa ${on.join(', ')}` : '', off.length ? `apaga ${off.join(', ')} en este repo` : ''].filter(Boolean).join('; ');
    return { status: 'would-do', ...(conflicts.length ? { conflicts } : {}), actions: [{ path: f, op: raw === null ? 'create' : 'merge', desc: `${prof ? `perfil ${prof}` : 'plugins base'}${what ? `: ${what}` : ''} (${ctx.answers.share ? 'para todo el que clone el repo' : 'solo en tu máquina'}; lo que había se conserva)`, content: JSON.stringify(next, null, 2) + '\n' }] };
  },
  'git-hook'(ctx) {
    if (ctx.det.hookManagers.length) return { status: 'refused', reason: `el repo ya usa ${ctx.det.hookManagers.join(', ')} para sus git hooks: no se instala el de ai-env (sumá secscan ahí si querés)` };
    const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ctx.root, encoding: 'utf8' });
    if (common.status !== 0) return { status: 'refused', reason: 'no se pudo ubicar la carpeta .git' };
    const hook = path.join(common.stdout.trim(), 'hooks', 'pre-commit');
    const cur = ctx.fs.read(hook);
    if (cur !== null && !cur.includes(GH.MARK)) return { status: 'refused', reason: 'ya hay un pre-commit propio en .git/hooks: no se pisa (sumá secscan ahí si querés)' };
    const A = [];
    const d = GH.dir();
    for (const [rel, src] of GH.FILES) {
      const target = path.join(d, rel), want = fs.readFileSync(src, 'utf8'), have = ctx.fs.read(target);
      if (have !== want) A.push({ path: target, abs: true, op: have === null ? 'create' : 'replace', desc: `${have === null ? 'copiar' : 'actualizar'} ${rel} en ${d} (fuera del plugin: su ruta cambia con cada versión)`, content: want });
    }
    const shim = GH.shim(d);
    if (cur !== shim) A.push({ path: hook, abs: true, op: cur === null ? 'create' : 'replace', exec: true, desc: `${cur === null ? 'instalar' : 'actualizar'} .git/hooks/pre-commit: secscan sobre el índice (frena severidad alta) y arch-check si hay architecture.json. Red de seguridad: --no-verify lo saltea`, content: shim });
    return A.length ? { status: 'would-do', actions: A } : { status: 'nothing', reason: 'el pre-commit de ai-env ya está instalado y al día' };
  },
  ci(ctx) {
    const A = [];
    for (const f of ['workflows/architecture.yml', 'workflows/security.yml', 'dependabot.yml']) {
      if (ctx.fs.read(`.github/${f}`) === null) A.push({ path: `.github/${f}`, op: 'create', desc: f === 'dependabot.yml' ? 'dependabot' : `workflow ${path.basename(f, '.yml') === 'architecture' ? 'de arquitectura (arch-check)' : 'de seguridad'}`, content: fs.readFileSync(path.join(T, 'github', f), 'utf8') });
    }
    return A.length ? { status: 'would-do', actions: A } : { status: 'nothing', reason: 'los workflows ya existen' };
  },
};

function runSteps(root, plan, det) {
  const ctx = { root, det, answers: plan.answers, fs: overlay(root) };
  const steps = [];
  for (const id of plan.approved) {
    const r = STEPS[id](ctx);
    if (r.status === 'would-do') for (const a of r.actions) ctx.fs.write(a.path, a.op === 'append' ? (ctx.fs.read(a.path) || '') + a.content : a.content);
    steps.push({ id, ...r });
  }
  return steps;
}

// Huella: el plan y, por acción, el contenido a escribir y el estado actual del archivo. Si algo cambia, apply se niega.
function stampOf(root, plan, steps) {
  const canon = steps.map((s) => ({ id: s.id, status: s.status, reason: s.reason || null, actions: (s.actions || []).map((a) => {
    let before = null; try { before = sha(fs.readFileSync(a.abs ? a.path : path.join(root, a.path))); } catch { /* no existe */ }
    return { path: a.path, op: a.op, content: sha(a.content), before };
  }) }));
  return sha(JSON.stringify({ plan, steps: canon })).slice(0, 24);
}

// Lo que se muestra: nunca el contenido de .private-terms (solo cuántos términos).
const shown = (steps) => steps.map((s) => ({ id: s.id, status: s.status, ...(s.reason ? { reason: s.reason } : {}), ...(s.conflicts ? { conflicts: s.conflicts } : {}), ...(s.actions ? { actions: s.actions.map((a) => ({ path: a.path, op: a.op, desc: a.desc })) } : {}) }));

function backupDir(root) {
  const home = process.env.AI_ENV_HOME || os.homedir();
  return path.join(home, '.claude', 'ai-env', 'init-backup', `${path.basename(root)}-${sha(root).slice(0, 8)}`, new Date().toISOString().replace(/[:.]/g, '-'));
}

// Escribe en orden y lleva un diario; si algo falla a mitad, deshace todo lo escrito (borra lo creado, trunca lo
// agregado y restaura lo reescrito) y avisa qué se revirtió. exit 3 solo si el rollback también falló.
// AI_ENV_INIT_FAIL_AT=<ruta> fuerza una falla al escribir esa ruta (solo para las pruebas del rollback).
function apply(root, steps) {
  const done = [];
  const notes = [];
  const journal = [];
  let bdir = null;
  for (const s of steps) {
    if (s.status !== 'would-do') continue;
    for (const a of s.actions) {
      const abs = a.abs ? a.path : path.join(root, a.path);
      try {
        if (process.env.AI_ENV_INIT_FAIL_AT && path.resolve(abs) === path.resolve(root, process.env.AI_ENV_INIT_FAIL_AT)) throw new Error('falla inyectada (AI_ENV_INIT_FAIL_AT)');
        const existed = fs.existsSync(abs);
        const prev = existed ? fs.readFileSync(abs) : null;
        if (a.op === 'create' && existed) throw new Error(`${a.path} apareció entre el preview y el apply`);
        const madeDirs = [];
        for (let d = path.dirname(abs); !fs.existsSync(d); d = path.dirname(d)) madeDirs.unshift(d);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        journal.push({ abs, prev, madeDirs });
        if (a.op === 'merge') {
          bdir = bdir || backupDir(root);
          fs.mkdirSync(path.dirname(path.join(bdir, a.path)), { recursive: true });
          fs.writeFileSync(path.join(bdir, a.path), prev);
        }
        if (a.op === 'append') fs.appendFileSync(abs, a.content); else fs.writeFileSync(abs, a.content);
        if (a.exec) { try { fs.chmodSync(abs, 0o755); } catch { /* Windows: no hace falta */ } }
        done.push(a.path);
      } catch (e) {
        const failedRb = [];
        for (const j of journal.reverse()) {
          try {
            if (j.prev === null) { if (fs.existsSync(j.abs)) fs.unlinkSync(j.abs); for (const d of [...j.madeDirs].reverse()) { try { fs.rmdirSync(d); } catch { /* no vacía */ } } }
            else fs.writeFileSync(j.abs, j.prev);
          } catch (re) { failedRb.push(`${j.abs}: ${re.message}`); }
        }
        if (failedRb.length) {
          const err = new Fail('partial', `falló ${a.path}: ${e.message}; y no se pudo revertir: ${failedRb.join('; ')}`, `revisá git status${bdir ? ` (respaldo en ${bdir})` : ''} antes de repetir`);
          err.done = done; throw err;
        }
        const err = new Fail('rolled-back', `falló ${a.path}: ${e.message}. Se revirtió todo lo escrito (${done.length} archivo(s)): el repo quedó como estaba`, 'corregí la causa y volvé a correr preview y apply');
        err.reverted = done; throw err;
      }
    }
  }
  if (bdir) notes.push(`respaldo de lo modificado en ${bdir}`);
  return { done: [...new Set(done)], notes };
}

function summaryOf(root, det) {
  const existing = {
    claudeMd: det.hasClaudeMd, state: fs.existsSync(path.join(root, 'docs', 'STATE.md')) || fs.existsSync(path.join(root, 'docs', 'ESTADO.md')),
    devflowJson: fs.existsSync(path.join(root, '.claude', 'dev-flow.json')), agentsMd: fs.existsSync(path.join(root, 'AGENTS.md')),
    privateTerms: fs.existsSync(path.join(root, '.private-terms')),
    settings: (() => { const f = path.join(root, '.claude', 'settings.json'); if (!fs.existsSync(f)) return null; try { JSON.parse(fs.readFileSync(f, 'utf8')); return 'ok'; } catch { return 'invalid'; } })(),
  };
  const shared = det.remote !== null;
  const would = (mode, ids) => runSteps(root, { approved: ids, answers: { mode, profile: det.suggestedProfile, share: shared, privateTerms: [] } }, det).filter((s) => s.status === 'would-do').map((s) => s.id);
  const attention = [];
  if (!det.blank) {
    if (det.packageManager === null && det.languages.length) attention.push('unrecognized-runner');
    else for (const c of det.missingChecks) attention.push(`no-${c}`);
    if (det.testPlaceholder) attention.push('test-placeholder');
    if (!det.hasArchitecture) attention.push('no-arch');
    if (det.suggestedType.startsWith('web+api')) attention.push('several-stacks');
  }
  if (existing.settings === 'invalid') attention.push('settings-invalid');
  if (det.remote !== 'github') attention.push('no-github-remote');
  if (existing.claudeMd) attention.push('existing-claude-md');
  if (existing.devflowJson) attention.push('existing-dev-flow');
  if (!fs.existsSync(path.join(root, 'docs', 'STATE.md')) && fs.existsSync(path.join(root, 'docs', 'ESTADO.md'))) attention.push('legacy-estado');
  if (!det.blank && det.needsBuild && det.packageManager !== null && !det.scripts.includes('build')) attention.push('no-build');
  if (det.testWatch) attention.push('test-watch');
  if (det.crlfFiles.length) attention.push('mixed-eol');
  if (det.hookManagers.length) attention.push('git-hook-other');
  const dirty = det.hasCommits ? dirtyFiles(root) : [];
  if (dirty.length) attention.push('dirty-other');
  if (!det.hasCommits) attention.push('no-commits');
  return {
    existing,
    summary: {
      mode: det.blank ? 'blank' : 'existing',
      harnessGaps: harnessGaps(det),
      dirty: dirty.slice(0, 20),
      crlfFiles: det.crlfFiles.slice(0, 10),
      found: { languages: det.languages, frameworks: det.frameworks, packageManager: det.packageManager, scripts: det.scripts, suggestedType: det.suggestedType, remote: det.remote, projectPlugins: det.projectPlugins, suggestedProfile: det.suggestedProfile, profileReason: det.profileReason },
      ask: det.blank
        ? [{ id: 'create-base', kind: 'yes-no', default: true }]
        : [
          { id: 'mode', kind: 'choice', options: ['features', 'tech-lead'], default: existing.devflowJson ? 'tech-lead' : 'features' },
          { id: 'profile', kind: 'choice', options: PROFILES.order, default: det.suggestedProfile, reason: det.profileReason, plugins: Object.fromEntries(PROFILES.order.map((n) => [n, PROFILES.profiles[n].plugins])) },
          { id: 'share', kind: 'yes-no', default: shared, target: { true: '.claude/settings.json', false: '.claude/settings.local.json' } },
          { id: 'privateTerms', kind: 'free-text', default: [], maps: 'private-terms' },
        ],
      recommended: det.blank
        ? { features: would('features', ['gitignore', 'gitattributes', 'editorconfig', 'claude-md', 'state']) }
        : { features: would('features', ['gitignore', 'gitattributes', 'editorconfig', 'claude-md', 'state', 'hygiene-plan', 'settings']), 'tech-lead': would('tech-lead', ['gitignore', 'gitattributes', 'editorconfig', 'claude-md', 'state', 'hygiene-plan', 'tech-lead', 'settings']) },
      optional: det.blank ? [] : ['ci', 'git-hook'],
      attention,
      next: det.blank || !det.hasArchitecture ? 'arch:arch-first' : null,
    },
  };
}

function verify(root) {
  const checks = [];
  const add = (res, name, detail = '') => checks.push({ res, name, detail });
  const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return null; } };
  const gi = (read('.gitignore') || '').split(/\r?\n/);
  const miss = GITIGNORE.filter((w) => !gi.includes(w));
  add(miss.length ? 'AVISO' : 'OK', '.gitignore cubre el estado local', miss.join(', '));
  if (read('.private-terms') !== null) add(ignoredByGit(root, '.private-terms') ? 'OK' : 'FALLA', '.private-terms ignorado por git', ignoredByGit(root, '.private-terms') ? '' : 'se subiría al repo con los nombres que protege');
  if (read('.claude/settings.local.json') !== null) add(ignoredByGit(root, '.claude/settings.local.json') ? 'OK' : 'AVISO', '.claude/settings.local.json ignorado por git', ignoredByGit(root, '.claude/settings.local.json') ? '' : 'tu perfil local se subiría al repo');
  for (const f of ['.claude/settings.json', '.claude/settings.local.json', '.claude/dev-flow.json']) {
    const t = read(f);
    if (t === null) continue;
    try { JSON.parse(t); add('OK', `${f} es JSON válido`); } catch (e) { add('FALLA', `${f} es JSON válido`, e.message); }
  }
  const cm = read('CLAUDE.md');
  add(cm && cm.includes('<!-- commands:start -->') ? 'OK' : 'AVISO', 'CLAUDE.md con el bloque de comandos');
  add(cm && cm.includes('<!-- harness:start -->') ? 'OK' : 'AVISO', 'CLAUDE.md con la forma de trabajo (arranque, terminado, cierre)');
  if (read('.claude/dev-flow.json') !== null) {
    add(cm && cm.includes('@AGENTS.md') ? 'OK' : 'AVISO', 'CLAUDE.md importa AGENTS.md (modo Tech Lead)');
    add(read('docs/PRD.md') !== null ? 'OK' : 'AVISO', 'docs/PRD.md existe');
  }
  const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
  const hook = common.status === 0 ? path.join(common.stdout.trim(), 'hooks', 'pre-commit') : null;
  const h = hook ? (() => { try { return fs.readFileSync(hook, 'utf8'); } catch { return null; } })() : null;
  if (h && h.includes(GH.MARK)) add(fs.existsSync(path.join(GH.dir(), 'pre-commit.cjs')) ? (GH.stale().length ? 'AVISO' : 'OK') : 'FALLA', 'pre-commit de ai-env', !fs.existsSync(path.join(GH.dir(), 'pre-commit.cjs')) ? `falta ${path.join(GH.dir(), 'pre-commit.cjs')}: volvé a correr el paso git-hook` : GH.stale().length ? 'la copia quedó vieja: /dev-flow:setup --apply la actualiza' : '');
  return { ok: !checks.some((c) => c.res === 'FALLA'), checks };
}

function nextCommit(root, done) {
  const files = done.filter((f) => !path.isAbsolute(f) && !ignoredByGit(root, f));
  if (!files.length) return null;
  const message = 'chore: inicializa dev-flow en el repo';
  // Solo estos archivos: `--` deja afuera cualquier otro cambio que la persona tenga en curso.
  return { files, branch: 'chore/dev-flow-init', message, command: `git add -- ${files.map((f) => JSON.stringify(f)).join(' ')} && git commit -m ${JSON.stringify(message)} -- ${files.map((f) => JSON.stringify(f)).join(' ')}` };
}

// Árbol sucio: frena si un archivo que el plan va a tocar tiene cambios sin commitear; el resto solo se avisa.
// Un repo sin ningún commit todavía no se chequea (todo está sin seguimiento por definición).
function dirtyFiles(root) {
  const r = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n').filter((l) => l.trim()).map((l) => l.slice(3).split(' -> ').pop().trim().replace(/^"|"$/g, '')) : [];
}

function main(argv) {
  const o = parse(argv);
  const root = repoRoot(path.resolve(o.dir || process.cwd()));
  const det = detectStack(root);
  if (o.verb === 'detect') return { body: { ok: true, root, blank: det.blank, detection: det, ...summaryOf(root, det) }, code: 0 };
  if (o.verb === 'verify') {
    const v = verify(root);
    return v.ok ? { body: v, code: 0 } : { body: { ...v, kind: 'invalid-config' }, code: 1, alt: 'corregí lo que marca FALLA (o restaurá el respaldo de ~/.claude/ai-env/init-backup) y repetí verify' };
  }
  const plan = readPlan(o.plan);
  const steps = runSteps(root, plan, det);
  const stamp = stampOf(root, plan, steps);
  if (o.verb === 'apply' && stamp !== o.expect) return { body: { ok: false, kind: 'stale-preview', reason: 'el plan o el repo cambiaron desde el preview: no se escribió nada' }, code: 1, alt: 'volvé a correr preview, mostrale el resultado nuevo a la persona y repetí apply con el stamp nuevo' };
  if (det.hasCommits) {
    const dirty = new Set(dirtyFiles(root));
    const targets = [...new Set(steps.flatMap((x) => (x.status === 'would-do' ? x.actions : []).filter((a) => !a.abs).map((a) => a.path)))];
    const clash = targets.filter((f) => dirty.has(f));
    if (clash.length) return { body: { ok: false, kind: 'dirty-target', files: clash, reason: `estos archivos que init va a tocar tienen cambios sin commitear: ${clash.join(', ')}. Mezclarlos con lo que escribe init haría un commit confuso` }, code: 1, alt: 'commiteá o guardá esos cambios (git commit o git stash) y volvé a correr preview' };
  }
  if (o.verb === 'preview') return { body: { ok: true, stamp, steps: shown(steps) }, code: 0 };
  const r = apply(root, steps);
  return { body: { ok: true, steps: shown(steps).map((s) => ({ ...s, status: s.status === 'would-do' ? 'done' : s.status })), written: r.done, notes: r.notes, nextCommit: nextCommit(root, r.done) }, code: 0 };
}

if (require.main === module) {
  try {
    const r = main(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(r.body, null, 2)}\n`);
    if (r.alt) process.stderr.write(`dev-flow init: ${r.body.kind}\nAlternativa: ${r.alt}\n`);
    process.exitCode = r.code;
  } catch (e) {
    if (e instanceof Usage) { process.stderr.write(`dev-flow init: ${e.message}\n`); process.exitCode = 2; }
    else if (e instanceof Fail) {
      process.stdout.write(`${JSON.stringify({ ok: false, kind: e.kind, reason: e.message, ...(e.done ? { written: e.done } : {}), ...(e.reverted ? { reverted: e.reverted } : {}) }, null, 2)}\n`);
      process.stderr.write(`dev-flow init: ${e.message}\nAlternativa: ${e.alt}\n`);
      process.exitCode = e.kind === 'partial' ? 3 : 1;
    } else {
      process.stdout.write(`${JSON.stringify({ ok: false, kind: 'unexpected', reason: e.message })}\n`);
      process.stderr.write(`dev-flow init: ${e.message}\nAlternativa: revisá el estado del repo con git status antes de repetir\n`);
      process.exitCode = 3;
    }
  }
}
module.exports = { main, runSteps, STEP_IDS };
