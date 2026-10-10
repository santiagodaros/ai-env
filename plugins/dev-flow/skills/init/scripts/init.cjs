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

const STEP_IDS = ['gitignore', 'private-terms', 'claude-md', 'state', 'tech-lead', 'settings', 'ci'];
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
  const abs = (f) => path.join(root, f);
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

const STATE_TEMPLATE = '# STATE\n\nEstado vivo del proyecto. El hook rehydrate lo reinyecta tras /compact.\n\n## Decisiones\n- \n\n## Hecho\n- \n\n## Pendiente\n- \n';
const STATE_GENERATED = '\n## Estado generado desde GitHub\n\n<!-- estado:start -->\n(correr estado.cjs --write)\n<!-- estado:end -->\n';

const AGENTS_BLOCK = ['<!-- agents:start -->', '## Forma de trabajo: Tech Lead y workers', '',
  '@AGENTS.md', '',
  '- Esta sesión es el **Tech Lead**: analiza, parte en tickets (`/dev-flow:prd`, `/dev-flow:ticket`), lanza workers (`/dev-flow:dispatch`) y audita. No edita código de aplicación (el hook `lead-guard` lo impide en el checkout principal).',
  '- Estado en GitHub (issues, PRs con `Closes #N`, checks) y en `docs/STATE.md` (bloque generado con `estado.cjs --write`); el hilo de cada ticket, en `.dev-flow/tickets/<N>/` y, al cerrarlo, en `docs/tickets/<N>.md`.',
  '- Merge: lo decide una persona, con veredicto `aprobar` y checks verdes.',
  '<!-- agents:end -->', ''].join('\n');

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
    if (cur !== null && cur.includes('<!-- commands:start -->')) return { status: 'nothing', reason: 'CLAUDE.md ya tiene el bloque de comandos' };
    const block = commandsBlock(ctx.det);
    return { status: 'would-do', actions: [{ path: 'CLAUDE.md', op: cur === null ? 'create' : 'append', desc: cur === null ? 'crear CLAUDE.md con los comandos reales del repo' : 'agregar al final de CLAUDE.md el bloque de comandos reales (tu texto queda igual)', content: cur === null ? `# ${path.basename(ctx.root)}\n\n${block}` : appendText(cur, block).slice(cur.length) }] };
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
    let before = null; try { before = sha(fs.readFileSync(path.join(root, a.path))); } catch { /* no existe */ }
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

function apply(root, steps) {
  const done = [];
  const notes = [];
  let bdir = null;
  for (const s of steps) {
    if (s.status !== 'would-do') continue;
    for (const a of s.actions) {
      const abs = path.join(root, a.path);
      try {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        if (a.op === 'create') { if (fs.existsSync(abs)) throw new Error(`${a.path} apareció entre el preview y el apply`); fs.writeFileSync(abs, a.content); }
        else if (a.op === 'append') fs.appendFileSync(abs, a.content);
        else if (a.op === 'merge') {
          bdir = bdir || backupDir(root);
          fs.mkdirSync(path.dirname(path.join(bdir, a.path)), { recursive: true });
          fs.copyFileSync(abs, path.join(bdir, a.path));
          fs.writeFileSync(abs, a.content);
        }
        done.push(a.path);
      } catch (e) {
        const err = new Fail('partial', `falló ${a.path}: ${e.message}`, `quedaron escritos: ${done.join(', ') || 'nada'}. Revisá git status${bdir ? ` (respaldo en ${bdir})` : ''} antes de repetir`);
        err.done = done; err.backup = bdir;
        throw err;
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
  return {
    existing,
    summary: {
      mode: det.blank ? 'blank' : 'existing',
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
        ? { features: would('features', ['gitignore', 'claude-md', 'state']) }
        : { features: would('features', ['gitignore', 'claude-md', 'state', 'settings']), 'tech-lead': would('tech-lead', ['gitignore', 'claude-md', 'state', 'tech-lead', 'settings']) },
      optional: det.blank ? [] : ['ci'],
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
  if (read('.claude/dev-flow.json') !== null) {
    add(cm && cm.includes('@AGENTS.md') ? 'OK' : 'AVISO', 'CLAUDE.md importa AGENTS.md (modo Tech Lead)');
    add(read('docs/PRD.md') !== null ? 'OK' : 'AVISO', 'docs/PRD.md existe');
  }
  return { ok: !checks.some((c) => c.res === 'FALLA'), checks };
}

function nextCommit(root, done) {
  const files = done.filter((f) => !ignoredByGit(root, f));
  if (!files.length) return null;
  return { files, branch: 'chore/dev-flow-init', message: 'chore: inicializa dev-flow en el repo' };
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
  if (o.verb === 'preview') return { body: { ok: true, stamp, steps: shown(steps) }, code: 0 };
  if (stamp !== o.expect) return { body: { ok: false, kind: 'stale-preview', reason: 'el plan o el repo cambiaron desde el preview: no se escribió nada' }, code: 1, alt: 'volvé a correr preview, mostrale el resultado nuevo a la persona y repetí apply con el stamp nuevo' };
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
      process.stdout.write(`${JSON.stringify({ ok: false, kind: e.kind, reason: e.message, ...(e.done ? { written: e.done } : {}) }, null, 2)}\n`);
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
