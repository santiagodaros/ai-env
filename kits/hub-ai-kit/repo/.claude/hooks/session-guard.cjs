#!/usr/bin/env node
// PreToolUse (Bash): evita que Claude abra sesiones de Claude Code por su cuenta.
// - Bloquea `claude` con --bg/--background, -w/--worktree, --tmux o -p/--print, salvo vía feature-flow/scripts/launch.cjs.
// - launch.cjs --launch pide confirmación humana en pantalla.
// - Una sesión lanzada por feature-flow (FEATURE_FLOW_CHILD=1) no puede lanzar nada.
let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  let cmd = '';
  try { cmd = String((JSON.parse(raw).tool_input || {}).command || ''); } catch { process.exit(0); }
  const SPAWN = /(^|[\s;&|(])claude(\.exe|\.cmd)?(\s[^;&|\n]*?)?\s(--bg|--background|-w|--worktree|--tmux|-p|--print)(\s|=|$)/;
  const viaLauncher = /feature-flow[\\/]scripts[\\/]launch\.cjs/.test(cmd);
  const child = !!process.env.FEATURE_FLOW_CHILD;
  const block = m => { process.stderr.write(m + '\n'); process.exit(2); };
  if (/arch-first[\\/]scripts[\\/]approve\.cjs/.test(cmd)) block('Bloqueado: la aprobación de la arquitectura la da la persona. Pedile que corra approve.cjs en su terminal.');
  if (viaLauncher) {
    if (child && /--launch\b/.test(cmd)) block('Bloqueado: una sesión lanzada por feature-flow no puede lanzar otras.');
    if (/--launch\b/.test(cmd)) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'feature-flow quiere abrir una sesión nueva en segundo plano. Confirmá solo si lo pediste.' } }));
    }
    process.exit(0);
  }
  if (SPAWN.test(cmd)) block('Bloqueado: no abras sesiones de Claude Code por tu cuenta. Usá /feature-flow (scripts/launch.cjs) o pedile al usuario que abra la terminal.');
  process.exit(0);
});
