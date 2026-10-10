#!/usr/bin/env node
// PreToolUse (Bash|PowerShell): evita que Claude abra sesiones de Claude Code por su cuenta.
// - Bloquea `claude` con --bg/--background, -w/--worktree, --tmux o -p/--print, salvo vía los lanzadores del plugin
//   (feature-flow/scripts/launch.cjs y dispatch/scripts/dispatch.cjs).
// - Cualquier --launch de esos lanzadores pide confirmación humana; encadenado con otros comandos, se bloquea.
// - Una sesión lanzada por ellos (FEATURE_FLOW_CHILD=1) no puede lanzar nada.
const { run, block, ask } = require('./lib.cjs');

run('session-guard', (input) => {
  const cmd = String((input.tool_input || {}).command || '');
  const SPAWN = /(^|[\s;&|(])claude(\.exe|\.cmd)?(\s[^;&|\n]*?)?\s(--bg|--background|-w|--worktree|--tmux|-p|--print)(\s|=|$)/;
  const LAUNCHER = String.raw`(?:feature-flow[\\/]scripts[\\/]launch|dispatch[\\/]scripts[\\/]dispatch)\.cjs`;
  // Solo cuenta como lanzador el comando que es exactamente `node <ruta>/(launch|dispatch).cjs [subcomando] [opciones]`,
  // sin encadenar nada: así no sirve de salvoconducto para otro `claude` en la misma línea.
  const exact = new RegExp(`^\\s*node\\s+("[^"]*${LAUNCHER}"|[^\\s;&|"']*${LAUNCHER})(\\s+[a-z]+)?(\\s+--?[\\w-]+(?:[= ][\\w.\\/:#-]+)?)*\\s*$`).test(cmd);
  const mentions = new RegExp(LAUNCHER).test(cmd);
  const child = !!process.env.FEATURE_FLOW_CHILD;
  if (mentions && /--launch\b/.test(cmd)) {
    if (child) block('una sesión lanzada por feature-flow o dispatch no puede lanzar otras.', 'child-launch');
    if (!exact) block('corré el lanzador solo, sin encadenar otros comandos, para que el pedido de confirmación sea claro.', 'launch-chained');
    ask(/dispatch/.test(cmd) ? 'dispatch quiere lanzar un worker (otra sesión de Claude Code). Confirmá solo si lo pediste.' : 'feature-flow quiere abrir una sesión nueva en segundo plano. Confirmá solo si lo pediste.', 'launch');
  }
  if (SPAWN.test(cmd) && !exact) block('no abras sesiones de Claude Code por tu cuenta. Usá /dev-flow:feature-flow o /dev-flow:dispatch, o pedile al usuario que abra la terminal.', 'spawn-session');
});
