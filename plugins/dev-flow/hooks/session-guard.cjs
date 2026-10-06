#!/usr/bin/env node
// PreToolUse (Bash|PowerShell): evita que Claude abra sesiones de Claude Code por su cuenta.
// - Bloquea `claude` con --bg/--background, -w/--worktree, --tmux o -p/--print, salvo vía feature-flow/scripts/launch.cjs.
// - launch.cjs --launch pide confirmación humana en pantalla.
// - Una sesión lanzada por feature-flow (FEATURE_FLOW_CHILD=1) no puede lanzar nada.
// - Claude no puede sellar la aprobación de la arquitectura (approve.cjs).
const { run, block, ask } = require('./lib.cjs');

run('session-guard', (input) => {
  const cmd = String((input.tool_input || {}).command || '');
  const SPAWN = /(^|[\s;&|(])claude(\.exe|\.cmd)?(\s[^;&|\n]*?)?\s(--bg|--background|-w|--worktree|--tmux|-p|--print)(\s|=|$)/;
  // Solo cuenta como lanzador el comando que es exactamente `node <ruta>/feature-flow/scripts/launch.cjs [opciones]`,
  // sin encadenar nada: así no sirve de salvoconducto para otro `claude` en la misma línea.
  const viaLauncher = /^\s*node\s+("[^"]*feature-flow[\\/]scripts[\\/]launch\.cjs"|[^\s;&|"']*feature-flow[\\/]scripts[\\/]launch\.cjs)(\s+--?[\w-]+(?:[= ][\w.\/:-]+)?)*\s*$/.test(cmd);
  const child = !!process.env.FEATURE_FLOW_CHILD;
  if (/arch-first[\\/]scripts[\\/]approve\.cjs/.test(cmd)) block('la aprobación de la arquitectura la da la persona. Pedile que corra approve.cjs en su terminal.', 'approve-by-claude');
  if (viaLauncher) {
    if (!/--launch\b/.test(cmd)) return;
    if (child) block('una sesión lanzada por feature-flow no puede lanzar otras.', 'child-launch');
    ask('feature-flow quiere abrir una sesión nueva en segundo plano. Confirmá solo si lo pediste.', 'launch');
  }
  if (SPAWN.test(cmd)) block('no abras sesiones de Claude Code por tu cuenta. Usá /dev-flow:feature-flow (scripts/launch.cjs) o pedile al usuario que abra la terminal.', 'spawn-session');
});
