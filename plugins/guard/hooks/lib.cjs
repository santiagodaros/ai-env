// Utilidades comunes de los hooks. Sin dependencias.
// Interruptores (variables de entorno del proceso de Claude Code, no de los comandos que corre Claude):
//   AI_ENV_HOOKS=off              apaga todos los hooks de ai-env
//   AI_ENV_HOOKS_SKIP=a,b         apaga los hooks nombrados (p. ej. bash-guard,stop-verify)
//   AI_ENV_GUARD_STRICT=1         lo que normalmente pide confirmación pasa a bloquearse
const off = (name) => {
  if (/^(off|0|false|no)$/i.test(String(process.env.AI_ENV_HOOKS || ''))) return true;
  return String(process.env.AI_ENV_HOOKS_SKIP || '').split(',').map((s) => s.trim()).includes(name);
};
const block = (msg) => { process.stderr.write(`Bloqueado: ${msg}\n`); process.exit(2); };
const ask = (reason) => {
  if (/^(1|true|on|yes)$/i.test(String(process.env.AI_ENV_GUARD_STRICT || ''))) block(reason);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } }));
  process.exit(0);
};
// Lee el JSON del hook por stdin y llama a fn(input). Entrada ilegible: no bloquear.
const run = (name, fn) => {
  if (off(name)) process.exit(0);
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(raw); } catch { process.exit(0); }
    fn(input || {});
    process.exit(0);
  });
};
module.exports = { off, block, ask, run };
