#!/usr/bin/env node
// SessionStart: reinyecta contexto desde archivos (lo que se imprime por stdout entra al contexto).
// - source "compact" (o sin source): docs/STATE.md, más la feature activa si la hay.
// - source "startup"/"resume": solo la feature activa (docs/features/<slug>/STATE.md y HANDOFF.md).
// Feature activa = la carpeta docs/features/<slug> cuyo slug coincide con el nombre del worktree/carpeta o de la rama.
// Si no hay nada que inyectar, no imprime nada.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

  if (source === 'compact') {
    const state = read(path.join(cwd, 'docs', 'STATE.md'));
    if (state) {
      out.push(
        'La conversación acaba de compactarse. Este es el estado del proyecto (docs/STATE.md). ' +
          'Si algo del resumen automático lo contradice, gana el STATE. ' +
          'Antes de seguir, resumí en 5 líneas lo entendido y pedí confirmación.\n\n' +
          state.slice(0, MAX) + (state.length > MAX ? '\n[STATE truncado: mover lo histórico a docs/STATE-archive.md]' : '')
      );
    }
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
        const bp = path.join(cwd, '.claude', 'skills', 'budget-plan', 'scripts', 'budget.cjs');
        if (fs.existsSync(bp)) spawnSync(process.execPath, [bp, 'start', s], { cwd, encoding: 'utf8' });
      }
      const state = read(path.join(featRoot, s, 'STATE.md'));
      const handoff = read(path.join(featRoot, s, 'HANDOFF.md'));
      out.push(
        `Estás trabajando la feature "${s}". Contexto desde docs/features/${s}/ (leé SPEC.md si necesitás el detalle). ` +
          'Antes de seguir, resumí en 3 líneas el próximo paso y pedí confirmación. No abras sesiones nuevas.\n\n' +
          `## HANDOFF\n${handoff.slice(0, MAX / 2)}\n\n## STATE\n${state.slice(0, MAX / 2)}`
      );
    }
  }

  if (out.length) process.stdout.write(out.join('\n\n---\n\n') + '\n');
  process.exit(0);
});
