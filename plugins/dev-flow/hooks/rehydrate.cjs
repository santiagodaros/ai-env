#!/usr/bin/env node
// SessionStart: reinyecta contexto desde archivos (lo que se imprime por stdout entra al contexto).
// - source "compact" (o sin source): el estado del proyecto (docs/STATE.md, o el que diga .claude/dev-flow.json), más la feature activa si la hay.
// - En una rama de ticket (feat/<N>-..., fix/<N>-...): recuerda el número de issue y cómo releerlo.
// - source "startup"/"resume": solo la feature activa (docs/features/<slug>/STATE.md y HANDOFF.md).
// Feature activa = la carpeta docs/features/<slug> cuyo slug coincide con el nombre del worktree/carpeta o de la rama.
// Si no hay nada que inyectar, no imprime nada.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');
const lib = require('./lib.cjs');
const config = require('../lib/config.cjs');
if (lib.off('rehydrate')) process.exit(0);

// Mantiene al día la statusline instalada por /dev-flow:setup (la copia vive fuera del plugin porque la ruta
// del plugin cambia con cada versión). Mejor esfuerzo: nunca rompe el arranque.
try {
  const src = path.join(__dirname, '..', 'scripts', 'statusline.cjs');
  const dst = path.join(process.env.AI_ENV_HOME || os.homedir(), '.claude', 'ai-env', 'statusline.cjs');
  if (fs.existsSync(dst) && fs.readFileSync(src, 'utf8') !== fs.readFileSync(dst, 'utf8')) fs.copyFileSync(src, dst);
} catch { /* sin statusline instalada */ }
// Igual con el hook de worktrees si /dev-flow:setup --worktrees lo instaló.
try {
  const wd = path.join(process.env.AI_ENV_HOME || os.homedir(), '.claude', 'ai-env', 'worktree');
  for (const [rel, from] of [['hooks/worktree.cjs', path.join(__dirname, 'worktree.cjs')], ['lib/config.cjs', path.join(__dirname, '..', 'lib', 'config.cjs')]]) {
    const dst = path.join(wd, rel);
    if (fs.existsSync(dst) && fs.readFileSync(from, 'utf8') !== fs.readFileSync(dst, 'utf8')) fs.copyFileSync(from, dst);
  }
} catch { /* sin hook de worktrees instalado */ }

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let source = 'compact';
  try {
    const input = JSON.parse(raw);
    if (!process.env.CLAUDE_PROJECT_DIR && input.cwd) cwd = input.cwd;
    if (input.source) source = input.source;
  } catch {
    /* sin stdin válido: seguir con cwd */
  }

  const MAX = 8000; // margen bajo el tope de 10.000 caracteres
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
  const out = [];

  let stateRel = 'docs/STATE.md';
  try { stateRel = config.load(config.repoRoot(cwd)).state || stateRel; } catch { /* config inválida: valor por defecto */ }
  // "Siguiente paso" y "Bloqueos" del STATE van primero: es lo que una sesión necesita para arrancar sin preguntar.
  const section = (t, name) => { const m = String(t).match(new RegExp(`^##\\s+${name}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'mi')); const b = m ? m[1].trim() : ''; return b.replace(/^[-*]\s*$/gm, '').trim(); };
  const restart = (t) => { const n = section(t, 'Siguiente paso'), b = section(t, 'Bloqueos'); return [n && `Siguiente paso:\n${n}`, b && `Bloqueos:\n${b}`].filter(Boolean).join('\n\n').slice(0, 1500); };
  const state = read(path.join(cwd, ...stateRel.split('/')));
  if (source === 'compact') {
    if (state) {
      const r = restart(state);
      out.push(
        `La conversación acaba de compactarse. Este es el estado del proyecto (${stateRel}). ` +
          'Si algo del resumen automático lo contradice, gana el STATE. ' +
          'Antes de seguir, resumí en 5 líneas lo entendido y pedí confirmación.\n\n' +
          (r ? `${r}\n\n---\n\n` : '') +
          state.slice(0, MAX) + (state.length > MAX ? '\n[STATE truncado: mover lo histórico a docs/STATE-archive.md]' : '')
      );
    }
  }

  // Rama de ticket: el contexto del worker es el issue, no el PRD completo.
  let onTicket = false;
  {
    const br = spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' });
    const m = br.status === 0 && br.stdout.trim().match(/^(feat|fix)\/(\d+)-/);
    if (m) {
      onTicket = true;
      out.push(`Estás en la rama del ticket #${m[2]} (${br.stdout.trim()}). Tu contexto es ese issue: releelo con \`gh issue view ${m[2]}\` si lo perdiste. No leas el PRD completo; si te falta algo, pedilo en el issue.`);
      // Expediente del ticket (vive en el repo principal aunque estés en un worktree): resumen en lugar de releer código.
      try {
        const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8' }).stdout.trim();
        const main = path.basename(common) === '.git' ? path.dirname(common) : cwd;
        const d = path.join(main, '.dev-flow', 'tickets', m[2]);
        const idx = read(path.join(d, 'index.md'));
        if (idx) out.push(`Expediente del ticket (${d}):\n\n${idx.slice(0, 3500)}\n\nActualizá ${path.join(d, 'progress.md')} mientras trabajás.`);
      } catch { /* sin expediente */ }
    }
  }

  // Tech Lead (no es un worker ni una rama de ticket): su plan de oleadas, guardado fuera del chat.
  if (!process.env.FEATURE_FLOW_CHILD && !onTicket) {
    try {
      const plan = JSON.parse(read(path.join(config.repoRoot(cwd), '.dev-flow', 'plan.json')) || 'null');
      if (plan && Array.isArray(plan.waves) && plan.waves.length) {
        const ds = path.join(__dirname, '..', 'skills', 'dispatch', 'scripts', 'dispatch.cjs');
        const r = spawnSync(process.execPath, [ds, 'plan', 'show'], { cwd: config.repoRoot(cwd), encoding: 'utf8', timeout: 8000 });
        if (r.status === 0 && r.stdout.trim()) out.push(`Plan del Tech Lead (.dev-flow/plan.json). Seguí desde la primera ola con tickets sin cerrar. El próximo paso de cada ticket, con su comando: dispatch next.\n\n${r.stdout.trim()}`);
      }
    } catch { /* sin plan */ }
  }

  // Feature activa
  const featRoot = path.join(cwd, 'docs', 'features');
  if (fs.existsSync(featRoot)) {
    const br = spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' });
    const branch = br.status === 0 ? br.stdout.trim() : '';
    const here = path.basename(cwd);
    const hits = fs.readdirSync(featRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((s) => here === s || branch === s || branch.endsWith('/' + s) || branch.endsWith('-' + s) || cwd.replace(/\\/g, '/').includes('/worktrees/' + s));
    if (hits.length === 1) {
      const s = hits[0];
      // Inicia la medición de consumo de esta feature (idempotente). Mejor esfuerzo: nunca rompe el arranque.
      if (source !== 'compact') {
        const bp = path.join(__dirname, '..', 'skills', 'budget-plan', 'scripts', 'budget.cjs');
        if (fs.existsSync(bp)) spawnSync(process.execPath, [bp, 'start', s], { cwd, encoding: 'utf8' });
      }
      const state = read(path.join(featRoot, s, 'STATE.md'));
      const handoff = read(path.join(featRoot, s, 'HANDOFF.md'));
      // Etapa y siguiente paso según archivos y git: así el flujo se conduce solo, sin depender de que alguien recuerde la skill.
      let etapa = '';
      try {
        const sc = path.join(__dirname, '..', 'skills', 'feature-run', 'scripts', 'stage.cjs');
        const r = spawnSync(process.execPath, [sc, '--slug', s], { cwd, encoding: 'utf8', timeout: 15000 });
        const j = JSON.parse(r.stdout || '{}');
        if (j.stage) etapa = `Etapa actual: ${j.stage} (${j.why}). Siguiente paso: ${j.next}. Para seguir de corrido: /dev-flow:feature-run ${s}.\n\n`;
      } catch { /* sin etapa: se inyecta igual el contexto */ }
      out.push(
        `Estás trabajando la feature "${s}". Contexto desde docs/features/${s}/ (leé SPEC.md si necesitás el detalle). ` +
          'Antes de seguir, resumí en 3 líneas el próximo paso y pedí confirmación. No abras sesiones nuevas.\n\n' +
          etapa + `## HANDOFF\n${handoff.slice(0, MAX / 2)}\n\n## STATE\n${state.slice(0, MAX / 2)}`
      );
    }
  }

  // Arranque sin feature ni ticket: solo el siguiente paso y los bloqueos del proyecto (corto; el STATE entero va tras /compact).
  if (source !== 'compact' && !out.length && state) {
    const r = restart(state);
    if (r) out.push(`Estado del proyecto (${stateRel}) al arrancar:\n\n${r}`);
  }

  if (out.length) process.stdout.write(out.join('\n\n---\n\n') + '\n');
  process.exit(0);
});
